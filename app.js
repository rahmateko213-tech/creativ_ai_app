// State Management
let state = {
    apiKey: '',
    topic: '',
    tone: 'Profesional',
    ideas: [],
    selectedIdea: null,
    outline: [],
    finalEbook: ''
};

// DOM Elements
const panels = document.querySelectorAll('.wizard-panel');
const steps = document.querySelectorAll('.step');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

// Utility Functions
function showLoading(text) {
    loadingText.textContent = text;
    loadingOverlay.classList.add('active');
}

function hideLoading() {
    loadingOverlay.classList.remove('active');
}

function goToStep(stepIndex) {
    // Basic Validation for API Key
    if (stepIndex > 1) {
        state.apiKey = document.getElementById('apiKey').value.trim();
        if (!state.apiKey) {
            alert("⚠️ Harap masukkan Gemini API Key terlebih dahulu di menu sebelah kiri.");
            return;
        }
    }

    // Update Panels
    panels.forEach((panel, i) => {
        if (i === stepIndex - 1) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });

    // Update Navigation Tracker
    steps.forEach((step, i) => {
        step.classList.remove('active');
        step.classList.remove('completed');

        if (i < stepIndex - 1) {
            step.classList.add('completed');
        } else if (i === stepIndex - 1) {
            step.classList.add('active');
        }
    });
}

// Gemini API Wrapper
async function callGeminiAPI(prompt, expectJson = false, maxRetries = 3) {
    // Gunakan v1beta dan snake_case untuk kompatibilitas maksimal fitur JSON Mode, menggunakan Flash model untuk Free Tier
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${state.apiKey}`;

    // Konfigurasi request (menggunakan snake_case untuk REST API)
    const payload = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generation_config: {
            temperature: 0.7,
        }
    };

    if (expectJson) {
        payload.generation_config.response_mime_type = "application/json";
    }

    let retries = 0;
    while (retries < maxRetries) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.error?.message || `HTTP Error ${response.status}`;
                
                if (response.status === 429 || response.status === 503 || response.status >= 500) {
                    console.warn(`API limit/server error (${response.status}): ${errorMsg}. Retrying (${retries + 1}/${maxRetries})...`);
                    retries++;
                    if (retries >= maxRetries) {
                        throw new Error(`Gagal setelah ${maxRetries} percobaan karena server sedang sibuk/high demand. Coba lagi nanti.`);
                    }
                    // Exponential backoff with random jitter
                    const delay = (Math.pow(2, retries) * 2000) + (Math.random() * 1000);
                    // Update loading progress if we are in book generating
                    const progressStatus = document.getElementById('writingStatus');
                    if (progressStatus && progressStatus.textContent.includes('Menulis')) {
                         const currentText = progressStatus.textContent.split('|')[0].trim();
                         progressStatus.textContent = `${currentText} | Server sibuk, mencoba ualng (${retries}/${maxRetries})...`;
                    }
                    
                    await new Promise(r => setTimeout(r, delay));
                    continue; // Coba lagi
                } else {
                    throw new Error(errorMsg); // Error selain 429/503 langsung lempar
                }
            }

            const data = await response.json();
            const textResponse = data.candidates[0].content.parts[0].text;

            if (expectJson) {
                return JSON.parse(textResponse);
            }

            // Memberikan jeda waktu (delay 1.5 detik) antara pengembalian hasil untuk mencegah hit limit API secara beruntun selanjutnya
            await new Promise(r => setTimeout(r, 1500));
            return textResponse;
        } catch (error) {
            // Jika masuk ke catch bukan karena throw di atas tapi misalnya koneksi putus
            if (error.message.includes("Gagal setelah")) {
                 console.error("API Error Max Retries:", error);
                 alert(`❌ ${error.message}`);
                 return null;
            }
            
            console.warn(`Connection or parsing error: ${error.message}. Retrying (${retries + 1}/${maxRetries})...`);
            retries++;
            if (retries >= maxRetries) {
                 console.error("API Fetch Error:", error);
                 alert(`❌ Terjadi kesalahan: ${error.message}`);
                 return null;
            }
            const delay = (Math.pow(2, retries) * 2000) + (Math.random() * 1000);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    return null;
}

// Step 1: Generate Ideas
document.getElementById('btnGenerateIdeas').addEventListener('click', async () => {
    state.topic = document.getElementById('topicInput').value.trim();
    state.tone = document.getElementById('toneInput').value;

    if (!state.topic) {
        alert("Topik harus diisi!");
        return;
    }

    // Cek API Key dulu
    state.apiKey = document.getElementById('apiKey').value.trim();
    if (!state.apiKey) {
        alert("⚠️ Harap masukkan Gemini API Key terlebih dahulu di menu sebelah kiri.");
        return;
    }

    showLoading('Mencari Ide Ebook Brilian...');

    const prompt = `Sebagai seorang penulis expert dan strategist ebook, berikan 3 ide judul dan deskripsi singkat untuk ebook berdasarkan:
Topik/Niche: ${state.topic}
Gaya Bahasa: ${state.tone}

Output HARUS WAJIB dalam format JSON murni TANPA markdown block, dengan struktur:
{
  "ideas": [
    { "title": "Judul 1", "description": "Deskripsi singkat..." },
    { "title": "Judul 2", "description": "Deskripsi singkat..." },
    { "title": "Judul 3", "description": "Deskripsi singkat..." }
  ]
}`;

    const result = await callGeminiAPI(prompt, true);
    hideLoading();

    if (result && result.ideas) {
        state.ideas = result.ideas;
        renderIdeas();
        goToStep(2);
    }
});

function renderIdeas() {
    const container = document.getElementById('ideasContainer');
    container.innerHTML = '';

    document.getElementById('btnGenerateOutline').disabled = true;

    state.ideas.forEach((idea, index) => {
        const card = document.createElement('div');
        card.className = 'idea-card';
        card.innerHTML = `
            <h3>✨ ${idea.title}</h3>
            <p>${idea.description}</p>
        `;

        card.addEventListener('click', () => {
            // Remove previous selections
            document.querySelectorAll('.idea-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');

            state.selectedIdea = idea;
            document.getElementById('btnGenerateOutline').disabled = false;
        });

        container.appendChild(card);
    });
}

// Step 2: Generate Outline
document.getElementById('btnGenerateOutline').addEventListener('click', async () => {
    if (!state.selectedIdea) return;

    showLoading('Menyusun Kerangka Ebook...');

    const prompt = `Anda adalah penulis ebook profesional. Buat kerangka struktur bab (outline) untuk ebook berikut. Ebook ini akan terdiri dari Pendahuluan, beberapa bab isi utama, dan Kesimpulan (Total keseluruhan harus 10 bab).
Judul: ${state.selectedIdea.title}
Deskripsi: ${state.selectedIdea.description}
Gaya Bahasa: ${state.tone}

Output HARUS WAJIB dalam format JSON murni TANPA markdown block, dengan struktur:
{
  "outline": [
    { "chapter_title": "Bab 1: Pendahuluan", "points": ["Poin 1", "Poin 2"] },
    { "chapter_title": "Bab 2: ...", "points": ["Poin 1", "Poin 2"] },
    ... hingga Bab 10
  ]
}`;

    const result = await callGeminiAPI(prompt, true);
    hideLoading();

    if (result && result.outline) {
        state.outline = result.outline;
        renderOutline();
        goToStep(3);
    }
});

function renderOutline() {
    let markdown = `# ${state.selectedIdea.title}\n\n`;
    markdown += `*${state.selectedIdea.description}*\n\n`;
    markdown += `## Kerangka Isi (Outline)\n\n`;

    state.outline.forEach(chapter => {
        markdown += `### ${chapter.chapter_title}\n`;
        chapter.points.forEach(point => {
            markdown += `- ${point}\n`;
        });
        markdown += `\n`;
    });

    document.getElementById('outlineContainer').innerHTML = marked.parse(markdown);
}

// Step 3: Generate Book Content
document.getElementById('btnGenerateBook').addEventListener('click', async () => {
    goToStep(4);

    const progressFill = document.getElementById('writingProgressFill');
    const progressStatus = document.getElementById('writingStatus');
    const previewText = document.getElementById('chapterPreviewText');

    state.finalEbook = `# ${state.selectedIdea.title}\n\n`;
    progressFill.style.width = '0%';
    previewText.innerHTML = '';

    const totalChapters = state.outline.length;

    for (let i = 0; i < totalChapters; i++) {
        const chapter = state.outline[i];
        progressStatus.textContent = `Menulis ${chapter.chapter_title}... (${i + 1}/${totalChapters})`;

        previewText.innerHTML += `<div style="color:var(--accent-primary)">\n> Sedang menulis: ${chapter.chapter_title}...</div>\n`;

        const prompt = `Anda adalah penulis hantu (ghostwriter) ahli. Tulislah ISI LENGKAP untuk bab ini.
Instruksi:
- Buku: ${state.selectedIdea.title}
- Bab yang harus ditulis: ${chapter.chapter_title}
- Poin yang harus dibahas: ${chapter.points.join(", ")}
- Gaya bahasa: ${state.tone}
- Tulis secara mendetail, mengalir, dan memberikan wawasan yang mendalam. Gunakan heading dalam format Markdown (## untuk sub-bab).
- PENTING: JANGAN menuliskan atau mencantumkan Judul Bab (misal: "# Bab 1:...") di awal tulisan Anda. Langsung saja mulai dari paragraf pertama isi bab tersebut. Judul bab akan saya tambahkan secara otomatis.
- JANGAN menuliskan kerangkanya lagi, langsung tulislah isi narasi/penjelasannya hingga akhir bab. Boleh tambahkan cerita analogi atau contoh jika perlu.

Hasilkan tulisan isi bab ini secara lengkap dalam format Markdown murni.`;

        const chapterContent = await callGeminiAPI(prompt, false);

        if (!chapterContent) {
            alert('Gagal menghasilkan bab: ' + chapter.chapter_title + '. Proses dihentikan.');
            return;
        }

        // Add to final ebook
        state.finalEbook += `\n\n# ${chapter.chapter_title}\n\n`;
        state.finalEbook += chapterContent;

        // Show in preview
        const trimmedPreview = chapterContent.substring(0, 150) + '...';
        previewText.innerHTML += `<div style="color:var(--text-secondary)">${trimmedPreview}</div><br>`;

        // Scroll to bottom of preview
        previewText.scrollTop = previewText.scrollHeight;

        // Update progress
        const percent = Math.floor(((i + 1) / totalChapters) * 100);
        progressFill.style.width = `${percent}%`;
    }

    progressStatus.textContent = "Penyusunan Ebook Selesai!";
    await new Promise(r => setTimeout(r, 1000)); // wait 1 sec to let use see completion

    renderFinalResult();
    goToStep(5);
});

function renderFinalResult() {
    document.getElementById('ebookResultContainer').innerHTML = marked.parse(state.finalEbook);
}

// Export Features
document.getElementById('btnCopyResult').addEventListener('click', () => {
    navigator.clipboard.writeText(state.finalEbook).then(() => {
        const btn = document.getElementById('btnCopyResult');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Tersalin!';
        setTimeout(() => { btn.innerHTML = originalText; }, 2000);
    });
});

document.getElementById('btnDownloadResult').addEventListener('click', () => {
    const filename = `${state.selectedIdea.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    const blob = new Blob([state.finalEbook], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

document.getElementById('btnDownloadPDF').addEventListener('click', () => {
    // Show a quick loading state on button
    const btn = document.getElementById('btnDownloadPDF');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyiapkan PDF...';
    btn.disabled = true;

    // Create wrapper element for PDF generation to keep styling inside the PDF
    const element = document.createElement('div');
    element.innerHTML = marked.parse(state.finalEbook);
    element.style.padding = '30px';
    element.style.fontFamily = "'Inter', Arial, sans-serif";
    element.style.color = '#111'; // Using dark text for PDF readability
    element.style.lineHeight = '1.6';

    // Style any headings or paragraphs for the PDF specifically
    const headings = element.querySelectorAll('h1, h2, h3, h4');
    headings.forEach(h => {
        h.style.color = '#333';
        h.style.marginTop = '20px';
        h.style.marginBottom = '10px';
    });

    const filename = `${state.selectedIdea.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
    
    const opt = {
      margin:       15, // 15mm margin
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    // Generate PDF
    html2pdf().set(opt).from(element).save().then(() => {
        // Restore button state
        btn.innerHTML = originalText;
        btn.disabled = false;
    }).catch(err => {
        console.error("PDF Error: ", err);
        btn.innerHTML = originalText;
        btn.disabled = false;
        alert("Gagal mengekspor PDF.");
    });
});
