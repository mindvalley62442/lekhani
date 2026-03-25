/* ─────────────────────────────────────────────────────────
   Lekhani · public/app.js
   Frontend only — all API calls go through the local
   Express server. No keys ever touch the browser.
───────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const pdfInput        = $('pdfInput');
  const dropZone        = $('dropZone');
  const fileChosen      = $('fileChosen');
  const fileName        = $('fileName');
  const removeFileBtn   = $('removeFile');
  const ocrBtn          = $('ocrBtn');
  const progressWrap    = $('progressWrap');
  const progressFill    = $('progressFill');
  const progressLabel   = $('progressLabel');
  const sectionResult   = $('section-result');
  const sectionGemini   = $('section-gemini');
  const sectionDirect   = $('section-direct');
  const ocrText         = $('ocrText');
  const charCount       = $('charCount');
  const directText      = $('directText');
  const directCharCount = $('directCharCount');
  const copyOcrBtn      = $('copyOcr');
  const clearOcrBtn     = $('clearOcr');
  const geminiPrompt    = $('geminiPrompt');
  const geminiBtn       = $('geminiBtn');
  const geminiResult    = $('geminiResult');
  const geminiText      = $('geminiText');
  const geminiCharCount = $('geminiCharCount');
  const copyGeminiBtn   = $('copyGemini');
  const downloadBtn     = $('downloadBtn');
  const docTitle        = $('docTitle');
  const toast           = $('toast');

  let selectedFile = null;

  // ── File handling ────────────────────────────────────────
  pdfInput.addEventListener('change', e => handleFile(e.target.files[0]));
  dropZone.addEventListener('click', (e) => {
    // Only trigger file dialog when clicking directly on dropZone, not on child elements
    // like the label button that already handle the file input directly
    const isChildElement = e.target !== dropZone && e.target.closest('label');
    if (!isChildElement) {
      pdfInput.click();
    }
  });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') handleFile(file);
    else showToast('Please drop a PDF file only 📜');
  });
  removeFileBtn.addEventListener('click', clearFile);

  function handleFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf') { showToast('Only PDF files are accepted 📜'); return; }
    if (file.size > 4 * 1024 * 1024)   { showToast('File too large — max 4 MB (Vercel limit)'); return; }
    selectedFile = file;
    fileName.textContent = file.name;
    fileChosen.classList.remove('hidden');
    dropZone.style.display = 'none';
    updateOcrBtn();
  }

  function clearFile() {
    selectedFile = null;
    pdfInput.value = '';
    fileChosen.classList.add('hidden');
    dropZone.style.display = '';
    updateOcrBtn();
  }

  function updateOcrBtn() { ocrBtn.disabled = !selectedFile; }

  // ── Char counts ──────────────────────────────────────────
  ocrText.addEventListener('input', () => {
    charCount.textContent = ocrText.value.length.toLocaleString('en-IN');
  });
  directText.addEventListener('input', () => {
    directCharCount.textContent = directText.value.length.toLocaleString('en-IN');
    // Show Gemini section when there's direct text
    if (directText.value.trim()) {
      sectionGemini.classList.remove('hidden');
    }
  });
  geminiText.addEventListener('input', () => {
    geminiCharCount.textContent = geminiText.value.length.toLocaleString('en-IN');
  });

  // ── Copy / Clear ─────────────────────────────────────────
  copyOcrBtn.addEventListener('click', () => copyText(ocrText.value, 'Text copied ✦'));
  clearOcrBtn.addEventListener('click', () => { ocrText.value = ''; charCount.textContent = '0'; });
  copyGeminiBtn.addEventListener('click', () => copyText(geminiText.value, "Oracle's wisdom copied ✦"));

  function copyText(text, message) {
    if (!text.trim()) { showToast('Nothing to copy yet'); return; }
    navigator.clipboard.writeText(text)
      .then(() => showToast(message))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(message);
      });
  }

  // ── OCR ──────────────────────────────────────────────────
  ocrBtn.addEventListener('click', runOCR);

  // Helper: fetch with timeout for slow mobile networks
  async function fetchWithTimeout(url, options, timeoutMs = 120000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('Request timed out - please try a smaller PDF or check your connection');
      }
      // Provide more helpful error messages
      if (err.message === 'Failed to fetch') {
        throw new Error('Network error - check your internet connection');
      }
      throw err;
    }
  }

  async function runOCR() {
    if (!selectedFile) { showToast('Please select a PDF file'); return; }
    setLoading(true, 'Offering the manuscript…', 5);
    console.log('[OCR] Starting - File size:', selectedFile.size, 'bytes');
    try {
      setProgress(20, 'Uploading the scroll…');
      const formData = new FormData();
      formData.append('pdf', selectedFile, selectedFile.name);
      setProgress(50, 'Reading the sacred text…');
      console.log('[OCR] Sending request to /api/ocr');
      const res  = await fetchWithTimeout('/api/ocr', { method: 'POST', body: formData }, 120000);
      console.log('[OCR] Response status:', res.status);
      setProgress(85, 'Gathering the revealed words…');
      
      // Check content-type to handle non-JSON responses (like Vercel HTML errors)
      const contentType = res.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        // Vercel returned HTML error page - extract error message
        const text = await res.text();
        console.error('[OCR] Non-JSON response:', text.substring(0, 200));
        throw new Error('Server error - file may be too large for Vercel (max 4MB)');
      }
      
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
      setProgress(100, 'Complete ✦');
      await sleep(500);
      ocrText.value = data.text;
      charCount.textContent = data.text.length.toLocaleString('en-IN');
      sectionResult.classList.remove('hidden');
      sectionGemini.classList.remove('hidden');
      sectionDirect.classList.add('hidden');
      sectionResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast('The scroll has been read ✦');
    } catch (err) {
      console.error('[OCR Error]', err);
      showToast('Error: ' + (err.message || 'Something went wrong'));
    } finally {
      setLoading(false);
    }
  }

  // ── Gemini Summarise ─────────────────────────────────────
  geminiBtn.addEventListener('click', runGemini);

  async function runGemini() {
    // Check for direct text first, then OCR text
    let text = directText.value.trim();
    if (!text) {
      text = ocrText.value.trim();
    }
    const prompt = geminiPrompt.value.trim();
    if (!text) { showToast('No text provided — enter text directly or run OCR first'); return; }

    geminiBtn.disabled = true;
    geminiBtn.querySelector('.btn-label').textContent = 'Consulting the Oracle…';
    geminiResult.classList.add('hidden');

    try {
      const res  = await fetch('/api/summarise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, prompt })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);

      geminiText.value = data.summary;
      geminiCharCount.textContent = data.summary.length.toLocaleString('en-IN');
      geminiResult.classList.remove('hidden');
      geminiResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast('The Oracle has spoken ✦');
    } catch (err) {
      console.error(err);
      showToast('Gemini error: ' + (err.message || 'Something went wrong'));
    } finally {
      geminiBtn.disabled = false;
      geminiBtn.querySelector('.btn-label').textContent = 'Invoke the Oracle';
    }
  }

  // ── Download Word Doc ────────────────────────────────────
  downloadBtn.addEventListener('click', downloadDocx);

  async function downloadDocx() {
    const text  = geminiText.value.trim();
    const title = docTitle.value.trim() || 'અધ્યાય';
    if (!text) { showToast('Nothing to download — Oracle has not spoken yet'); return; }

    downloadBtn.disabled = true;
    downloadBtn.querySelector('.btn-label').textContent = 'Crafting your document…';

    try {
      const res = await fetch('/api/download', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, title })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error (${res.status})`);
      }

      // Trigger browser download
      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = url;
      a.download     = `lekhani-${Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Document downloaded ✦');

    } catch (err) {
      console.error(err);
      showToast('Download error: ' + (err.message || 'Something went wrong'));
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.querySelector('.btn-label').textContent = 'Download as Word Document';
    }
  }

  // ── Progress helpers ─────────────────────────────────────
  function setLoading(active, label = '', pct = 0) {
    ocrBtn.disabled = active || !selectedFile;
    if (active) {
      progressWrap.classList.remove('hidden');
      setProgress(pct, label);
    } else {
      setTimeout(() => {
        progressWrap.classList.add('hidden');
        progressFill.style.width = '0%';
      }, 800);
    }
  }

  function setProgress(pct, label) {
    progressFill.style.width = pct + '%';
    progressLabel.textContent = label;
  }

  // ── Toast ────────────────────────────────────────────────
  let toastTimer = null;
  function showToast(msg) {
    if (!toast) {
      console.error('[showToast] toast element not found!');
      return;
    }
    toast.textContent = msg;
    toast.classList.remove('hidden');
    toast.getBoundingClientRect();
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.classList.add('hidden'), 400);
    }, 3000);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Show Gemini section by default for direct text input
  sectionGemini.classList.remove('hidden');

  updateOcrBtn();

})();
