document.addEventListener("DOMContentLoaded", () => {
    // ── Elements ──
    const radioButtons = document.querySelectorAll('input[name="inputMethod"]');
    const youtubeGroup = document.getElementById("youtubeInputGroup");
    const uploadGroup = document.getElementById("uploadInputGroup");
    const localGroup = document.getElementById("localInputGroup");
    
    const youtubeUrlInput = document.getElementById("youtubeUrl");
    const localPathInput = document.getElementById("localPath");
    const audioFileInput = document.getElementById("audioFile");
    
    const languageSelect = document.getElementById("languageSelect");
    const whisperModelSelect = document.getElementById("whisperModelSelect");
    const mistralKeyInput = document.getElementById("mistralKey");
    const sarvamKeyInput = document.getElementById("sarvamKey");
    const cookiesFileInput = document.getElementById("cookiesFile");
    const cookiesBrowserSelect = document.getElementById("cookiesBrowser");
    
    const analyzeBtn = document.getElementById("analyzeBtn");
    
    // Status Timeline Steps
    const steps = {
        audio: document.getElementById("step-audio"),
        transcript: document.getElementById("step-transcript"),
        title: document.getElementById("step-title"),
        summary: document.getElementById("step-summary"),
        extract: document.getElementById("step-extract"),
        rag: document.getElementById("step-rag")
    };
    
    // States views
    const emptyState = document.getElementById("emptyState");
    const loadingState = document.getElementById("loadingState");
    const resultsPanel = document.getElementById("resultsPanel");
    const notificationArea = document.getElementById("notificationArea");
    
    // Upload Progress
    const progressContainer = document.getElementById("uploadProgressContainer");
    const progressBar = document.getElementById("uploadProgressBar");
    const statusText = document.getElementById("uploadStatusText");
    const successMsg = document.getElementById("uploadSuccessMsg");
    
    // Results DOM
    const resultSessionTitle = document.getElementById("resultSessionTitle");
    const metricSource = document.getElementById("metricSource");
    const metricLanguage = document.getElementById("metricLanguage");
    const summaryContent = document.getElementById("summaryContent");
    const mediaPlayerContainer = document.getElementById("mediaPlayerContainer");
    
    const actionItemsContent = document.getElementById("actionItemsContent");
    const keyDecisionsContent = document.getElementById("keyDecisionsContent");
    const openQuestionsContent = document.getElementById("openQuestionsContent");
    const transcriptBox = document.getElementById("transcriptBox");
    
    // Chat DOM
    const chatHistory = document.getElementById("chatHistory");
    const chatForm = document.getElementById("chatForm");
    const chatInput = document.getElementById("chatInput");
    const clearChatBtn = document.getElementById("clearChatBtn");
    const downloadTranscriptBtn = document.getElementById("downloadTranscriptBtn");

    let activeFilePath = null;
    let activeFileName = null;
    let pollIntervalId = null;

    // ── Input Toggle Logic ──
    radioButtons.forEach(radio => {
        radio.addEventListener("change", (e) => {
            const val = e.target.value;
            youtubeGroup.classList.add("hidden");
            uploadGroup.classList.add("hidden");
            localGroup.classList.add("hidden");

            if (val === "youtube") {
                youtubeGroup.classList.remove("hidden");
            } else if (val === "upload") {
                uploadGroup.classList.remove("hidden");
            } else if (val === "local") {
                localGroup.classList.remove("hidden");
            }
        });
    });

    // ── File Upload Logic (XHR for Progress) ──
    audioFileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Reset display
        progressContainer.classList.remove("hidden");
        progressBar.style.width = "0%";
        statusText.textContent = "Uploading: 0%";
        successMsg.classList.add("hidden");
        activeFilePath = null;
        activeFileName = null;
        analyzeBtn.disabled = true;

        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload", true);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                progressBar.style.width = percent + "%";
                statusText.textContent = `Uploading: ${percent}%`;
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                activeFilePath = response.filepath;
                activeFileName = response.filename;
                progressBar.style.width = "100%";
                statusText.textContent = "Upload complete!";
                successMsg.textContent = `Uploaded: ${file.name}`;
                successMsg.classList.remove("hidden");
                analyzeBtn.disabled = false;
            } else {
                progressBar.style.width = "0%";
                statusText.textContent = "Upload failed!";
                showNotification(`File upload failed: ${xhr.responseText}`, "error");
                analyzeBtn.disabled = false;
            }
        };

        xhr.onerror = () => {
            progressBar.style.width = "0%";
            statusText.textContent = "Upload failed!";
            showNotification("Network error occurred during file upload.", "error");
            analyzeBtn.disabled = false;
        };

        xhr.send(formData);
    });

    // ── Start Pipeline Action ──
    analyzeBtn.addEventListener("click", async () => {
        const inputMethod = document.querySelector('input[name="inputMethod"]:checked').value;
        let sourceValue = "";
        let sourceTypeName = "YouTube URL";

        if (inputMethod === "youtube") {
            sourceValue = youtubeUrlInput.value.trim();
            sourceTypeName = "YouTube URL";
            if (!sourceValue) {
                showNotification("Please provide a valid YouTube URL", "error");
                return;
            }
        } else if (inputMethod === "upload") {
            sourceValue = activeFilePath;
            sourceTypeName = activeFileName || "Uploaded File";
            if (!sourceValue) {
                showNotification("Please upload an audio/video file first", "error");
                return;
            }
        } else if (inputMethod === "local") {
            sourceValue = localPathInput.value.trim();
            sourceTypeName = "Local File Path";
            if (!sourceValue) {
                showNotification("Please enter a valid local path", "error");
                return;
            }
        }

        const formData = new FormData();
        formData.append("source", sourceValue);
        formData.append("language", languageSelect.value);
        formData.append("whisper_model", whisperModelSelect.value);
        formData.append("source_type", sourceTypeName);
        formData.append("youtube_cookies_file", cookiesFileInput.value);
        formData.append("youtube_cookies_browser", cookiesBrowserSelect.value);
        formData.append("user_mistral_key", mistralKeyInput.value);
        formData.append("user_sarvam_key", sarvamKeyInput.value);

        hideNotification();
        analyzeBtn.disabled = true;
        
        // Update states to loading
        emptyState.classList.add("hidden");
        resultsPanel.classList.add("hidden");
        loadingState.classList.remove("hidden");

        // Reset step classes
        Object.values(steps).forEach(step => {
            step.className = "timeline-item";
            step.querySelector(".timeline-badge").textContent = "○";
        });

        try {
            const res = await fetch("/api/analyze", {
                method: "POST",
                body: formData
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Analysis startup failed");
            }

            // Start Polling Status
            startPollingStatus();

        } catch (err) {
            showNotification(err.message, "error");
            loadingState.classList.add("hidden");
            emptyState.classList.remove("hidden");
            analyzeBtn.disabled = false;
        }
    });

    // ── Polling Pipeline Status ──
    function startPollingStatus() {
        if (pollIntervalId) clearInterval(pollIntervalId);
        
        pollIntervalId = setInterval(async () => {
            try {
                const res = await fetch("/api/status");
                if (!res.ok) throw new Error("Could not fetch status");
                const data = await res.json();

                // Update timeline badges and text
                updateTimelineUI(data.steps);

                if (data.status === "completed") {
                    clearInterval(pollIntervalId);
                    pollIntervalId = null;
                    renderResults(data.result);
                    loadingState.classList.add("hidden");
                    resultsPanel.classList.remove("hidden");
                    analyzeBtn.disabled = false;
                    
                    // Prepopulate chat history if exists
                    renderChatHistory(data.chat_history);
                } else if (data.status === "failed") {
                    clearInterval(pollIntervalId);
                    pollIntervalId = null;
                    showNotification(`Pipeline failed: ${data.error}`, "error");
                    loadingState.classList.add("hidden");
                    emptyState.classList.remove("hidden");
                    analyzeBtn.disabled = false;
                }
            } catch (err) {
                console.error(err);
            }
        }, 1500);
    }

    function updateTimelineUI(stepStates) {
        for (const [key, state] of Object.entries(stepStates)) {
            const element = steps[key];
            if (!element) continue;

            const badge = element.querySelector(".timeline-badge");

            element.className = "timeline-item"; // Reset class
            if (state === "active") {
                element.classList.add("active");
                badge.textContent = "●";
            } else if (state === "done") {
                element.classList.add("done");
                badge.textContent = "✓";
            } else {
                badge.textContent = "○";
            }
        }
    }

    // ── Render Completed Results ──
    function renderResults(result) {
        resultSessionTitle.textContent = result.title;
        metricSource.textContent = result.source_type;
        metricLanguage.textContent = languageSelect.value.toUpperCase();
        
        summaryContent.textContent = result.summary;
        actionItemsContent.textContent = result.action_items;
        keyDecisionsContent.textContent = result.key_decisions;
        openQuestionsContent.textContent = result.open_questions;
        transcriptBox.textContent = result.transcript;

        // Render Media Player
        mediaPlayerContainer.innerHTML = "";
        const path = result.source_path;

        if (path.startsWith("http://") || path.startsWith("https://")) {
            // Check if YouTube link to embed it
            const youtubeId = getYoutubeId(path);
            if (youtubeId) {
                const iframe = document.createElement("iframe");
                iframe.src = `https://www.youtube.com/embed/${youtubeId}`;
                iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
                iframe.allowFullscreen = true;
                mediaPlayerContainer.appendChild(iframe);
            } else {
                const videoEl = document.createElement("video");
                videoEl.controls = true;
                videoEl.src = path;
                mediaPlayerContainer.appendChild(videoEl);
            }
        } else {
            // Local file
            const ext = path.split('.').pop().toLowerCase();
            if (ext === "mp4") {
                const videoEl = document.createElement("video");
                videoEl.controls = true;
                videoEl.src = `/api/media?path=${encodeURIComponent(path)}`;
                mediaPlayerContainer.appendChild(videoEl);
            } else {
                const audioEl = document.createElement("audio");
                audioEl.controls = true;
                audioEl.src = `/api/media?path=${encodeURIComponent(path)}`;
                mediaPlayerContainer.appendChild(audioEl);
            }
        }
    }

    function getYoutubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    // ── Tabs Switching Logic ──
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const tabId = btn.getAttribute("data-tab");

            tabButtons.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            document.getElementById(tabId).classList.add("active");
        });
    });

    // ── Transcript Download ──
    downloadTranscriptBtn.addEventListener("click", () => {
        const text = transcriptBox.textContent;
        const titleText = resultSessionTitle.textContent.replace(/\s+/g, "_");
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = `${titleText}_transcript.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // ── Chat Bot Interface ──
    chatForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const question = chatInput.value.trim();
        if (!question) return;

        chatInput.value = "";

        // Add user bubble
        appendChatBubble("user", question);
        scrollChatToBottom();

        // Add loading indicator
        const loadingId = appendChatBubble("assistant", "", true);
        scrollChatToBottom();

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "RAG chatbot query failed");
            }

            const data = await res.json();

            // Replace loading bubble with answer
            removeChatBubble(loadingId);
            appendChatBubble("assistant", data.answer);
            scrollChatToBottom();

        } catch (err) {
            removeChatBubble(loadingId);
            appendChatBubble("assistant", `❌ Error: ${err.message}`);
            scrollChatToBottom();
        }
    });

    clearChatBtn.addEventListener("click", async () => {
        try {
            await fetch("/api/clear-chat", { method: "POST" });
            chatHistory.innerHTML = "";
        } catch (err) {
            console.error("Clear chat history error:", err);
        }
    });

    function renderChatHistory(history) {
        chatHistory.innerHTML = "";
        history.forEach(msg => {
            appendChatBubble(msg.role, msg.content);
        });
        scrollChatToBottom();
    }

    function appendChatBubble(role, content, isLoading = false) {
        const id = "bubble-" + Date.now() + Math.random().toString(36).substr(2, 5);
        const bubble = document.createElement("div");
        bubble.className = `chat-msg ${role}`;
        bubble.id = id;

        const avatar = document.createElement("div");
        avatar.className = "msg-avatar";
        avatar.textContent = role === "user" ? "👤" : "🤖";

        const msgContent = document.createElement("div");
        msgContent.className = "msg-content";

        if (isLoading) {
            msgContent.innerHTML = `
                <div class="chat-loading-indicator">
                    <span class="chat-loading-dot"></span>
                    <span class="chat-loading-dot"></span>
                    <span class="chat-loading-dot"></span>
                </div>
            `;
        } else {
            msgContent.textContent = content;
        }

        bubble.appendChild(avatar);
        bubble.appendChild(msgContent);
        chatHistory.appendChild(bubble);

        return id;
    }

    function removeChatBubble(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function scrollChatToBottom() {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    // ── Notifications Helper ──
    function showNotification(msg, type = "info") {
        notificationArea.className = `notification-area ${type}`;
        notificationArea.innerHTML = `
            <span>${msg}</span>
            <button onclick="this.parentElement.classList.add('hidden')" style="background:transparent;border:0;color:inherit;font-weight:bold;cursor:pointer;outline:none;">×</button>
        `;
    }

    function hideNotification() {
        notificationArea.classList.add("hidden");
    }

    // Check current status on page load to restore running poll
    async function checkInitialStatus() {
        try {
            const res = await fetch("/api/status");
            if (res.ok) {
                const data = await res.json();
                if (data.status === "running") {
                    emptyState.classList.add("hidden");
                    loadingState.classList.remove("hidden");
                    updateTimelineUI(data.steps);
                    startPollingStatus();
                } else if (data.status === "completed") {
                    renderResults(data.result);
                    emptyState.classList.add("hidden");
                    resultsPanel.classList.remove("hidden");
                    renderChatHistory(data.chat_history);
                    updateTimelineUI(data.steps);
                }
            }
        } catch (err) {
            console.error("Initial status check failed:", err);
        }
    }

    checkInitialStatus();
});
