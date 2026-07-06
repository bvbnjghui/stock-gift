document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('imageInput');
    const selectedImagesPathsDiv = document.getElementById('selectedImagesPaths');
    const outputFilenameInput = document.getElementById('outputFilename');
    const paddingInput = document.getElementById('paddingInput');
    const downloadCollageBtn = document.getElementById('downloadCollage');
    const printCollageBtn = document.getElementById('printCollage'); // Print button remains
    const collageCanvas = document.getElementById('collageCanvas');
    const ctx = collageCanvas.getContext('2d');
    const metadataFile = document.getElementById('metadataFile');
    
    let tickerInputs = [];
let metadataMap = {};
    let loadedImages = []; // Stores Image objects (from HTMLImageElement)
    let currentCollageImage = null; // Stores the final generated collage Image object
    let zoomLevel = 1.0;
    let basePreviewWidth = 0;
    let basePreviewHeight = 0;

    const canvasContainer = collageCanvas.parentElement; // The div wrapping the canvas

    let selectedFiles = []; // Stores File objects
    // --- Metadata CSV Loading ---
    metadataFile.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) {
            metadataMap = {};
            return;
        }

        // Read raw bytes and decode with UTF-8, fallback to Big5 if needed
        const buffer = await file.arrayBuffer();
        let decoder = new TextDecoder('utf-8');
        let text = decoder.decode(buffer);
        // If UTF-8 decoding produced replacement characters, try Big5 encoding (common for Chinese Windows CSV)
        if (text.includes('�')) {
            try {
                decoder = new TextDecoder('big5');
                text = decoder.decode(buffer);
            } catch (e) {
                console.warn('Big5 decoding failed, using UTF-8');
            }
        }
        // Remove potential UTF-8 BOM and split into lines
        const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
        metadataMap = {};
        lines.forEach((line, idx) => {
            if (idx === 0 && line.toLowerCase().includes('ticker')) return;
            const parts = line.split(',');
            if (parts.length >= 3) {
                const ticker = parts[0].trim().toUpperCase();
                const time = parts[1].trim();
                const location = parts[2].trim();
                metadataMap[ticker] = {time, location};
            }
        });
        console.log('Metadata loaded', metadataMap);
    });

    // A4 dimensions at 300 DPI (landscape) - in pixels
    const A4_WIDTH_PX = 3508;
    const A4_HEIGHT_PX = 2480;
    const NUM_COLS = 4;
    const NUM_ROWS = 2;

    // --- Utility Functions ---

    function showAlert(title, message, type = 'info') {
        alert(`${title}: ${message}`); // Simple alert for web
    }

    function disableActionButtons(disabled) {
        downloadCollageBtn.disabled = disabled;
        printCollageBtn.disabled = disabled;
    }

    // --- Image Loading and Display (Individual Paths) ---

    imageInput.addEventListener('change', async (event) => {
        selectedFiles = Array.from(event.target.files);
        
        if (selectedFiles.length === 0) {
            if (selectedImagesPathsDiv) {
                selectedImagesPathsDiv.innerHTML = '<p>請選擇 1-8 張圖片。</p>';
            }
            loadedImages = [];
            currentCollageImage = null;
            disableActionButtons(true);
            clearCanvas();
            return;
        }

        if (selectedFiles.length > 8) {
            showAlert('警告', '您選擇了超過 8 張圖片，將只使用前 8 張。');
            selectedFiles = selectedFiles.slice(0, 8);
        }

        if (selectedImagesPathsDiv) {
            selectedImagesPathsDiv.innerHTML = '';
        }
        loadedImages = []; // Clear previous loaded images

        // Load images
        const loadingPromises = selectedFiles.map((file, index) => {
            if (selectedImagesPathsDiv) {
                selectedImagesPathsDiv.innerHTML += `<p>${index + 1}. ${file.name}</p>`;
            }
            return new Promise((resolve) => {
            // After images are loaded, create ticker input fields for each image
        const tickerInputsDiv = document.getElementById('tickerInputs');
        tickerInputsDiv.innerHTML = '';
        tickerInputs = new Array(selectedFiles.length).fill(''); // reset array
        selectedFiles.forEach((file, idx) => {
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = `代號 ${idx + 1} (${file.name})`;
            input.className = 'ticker-field';
            input.style.marginBottom = '8px';
            input.addEventListener('input', (e) => {
                // Store uppercase ticker and refresh preview
                tickerInputs[idx] = e.target.value.trim().toUpperCase();
                generateAndShowPreview();
            });
            tickerInputsDiv.appendChild(input);
            tickerInputsDiv.appendChild(document.createElement('br'));
        });

                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                            loadedImages[index] = img; // Store in correct order
                            resolve();
                        };
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
            });
        });

        await Promise.all(loadingPromises);
        
        // After all images are loaded, automatically generate preview
        if (loadedImages.length > 0) {
            generateAndShowPreview();
        } else {
            disableActionButtons(true);
            clearCanvas();
        }
    });

    // --- Input Change Listeners ---
    
    paddingInput.addEventListener('change', () => { // Use 'change' for input field when value is committed
        generateAndShowPreview();
    });

    outputFilenameInput.addEventListener('change', () => { // Also trigger on filename change
        generateAndShowPreview();
    });

    // --- Collage Generation Logic ---

    function generateCollageImage() {
        if (loadedImages.length === 0 || loadedImages.length > 8 || loadedImages.some(img => !img)) {
            return null;
        }

        const padding = parseInt(paddingInput.value);
        if (isNaN(padding) || padding < 0) {
            showAlert('錯誤', '間距 (Padding) 必須是有效的正整數。');
            return null;
        }

        const collageCanvasTemp = document.createElement('canvas');
        collageCanvasTemp.width = A4_WIDTH_PX;
        collageCanvasTemp.height = A4_HEIGHT_PX;
        const tempCtx = collageCanvasTemp.getContext('2d');
        tempCtx.fillStyle = 'white';
        tempCtx.fillRect(0, 0, A4_WIDTH_PX, A4_HEIGHT_PX);

        const availableWidthForBlocks = A4_WIDTH_PX - (NUM_COLS + 1) * padding;
        const availableHeightForBlocks = A4_HEIGHT_PX - (NUM_ROWS + 1) * padding;

        const imgBlockWidth = Math.floor(availableWidthForBlocks / NUM_COLS);
        const imgBlockHeight = Math.floor(availableHeightForBlocks / NUM_ROWS);

        for (let i = 0; i < loadedImages.length; i++) {
            const img = loadedImages[i];
            const originalWidth = img.naturalWidth;
            const originalHeight = img.naturalHeight;

            const scaleWidth = imgBlockWidth / originalWidth;
            const scaleHeight = imgBlockHeight / originalHeight;
            const scale = Math.min(scaleWidth, scaleHeight);

            const newImgWidth = Math.floor(originalWidth * scale);
            const newImgHeight = Math.floor(originalHeight * scale);

            const col = i % NUM_COLS;
            const row = Math.floor(i / NUM_COLS);

            const blockStartX = padding + col * (imgBlockWidth + padding);
            const blockStartY = padding + row * (imgBlockHeight + padding);

            const pasteXOffsetInBlock = Math.floor((imgBlockWidth - newImgWidth) / 2);
            const pasteYOffsetInBlock = Math.floor((imgBlockHeight - newImgHeight) / 2);

            const finalPasteX = blockStartX + pasteXOffsetInBlock;
            const finalPasteY = blockStartY + pasteYOffsetInBlock;

            tempCtx.drawImage(img, finalPasteX, finalPasteY, newImgWidth, newImgHeight);
                        // Draw metadata overlay if available (using a font that supports Chinese characters)
            const rawTicker = tickerInputs[i] || selectedFiles[i].name.replace(/\.[^/.]+$/, '').toUpperCase();
            const meta = metadataMap[rawTicker];
            if (meta) {
                const overlayText = `${meta.time} ${meta.location}`;
                tempCtx.fillStyle = 'black';
                const fontSize = 24;
                tempCtx.font = `${fontSize}px "Noto Sans TC", sans-serif`;
                tempCtx.textBaseline = 'top';
                // Measure text width for horizontal centering within the image block
                const textMetrics = tempCtx.measureText(overlayText);
                const textWidth = textMetrics.width;
                const bleedMargin = 20; // extra space to avoid cut‑off when printing
                const textX = blockStartX + (imgBlockWidth - textWidth) / 2;
                const textY = blockStartY + bleedMargin;
                tempCtx.fillText(overlayText, textX, textY);
            } else {
                console.warn('No metadata for ticker', rawTicker);
            }
        }

        // Convert the temporary canvas to an Image object for consistent handling
        const img = new Image();
        img.src = collageCanvasTemp.toDataURL('image/jpeg', 0.9); // Quality 0.9 for JPEG
        return img;
    }

    // --- Preview Display (Canvas) ---

    function clearCanvas() {
        ctx.clearRect(0, 0, collageCanvas.width, collageCanvas.height);
        collageCanvas.width = 1; // Reset width/height to clear effectively
        collageCanvas.height = 1;
        collageCanvas.style.backgroundColor = '#ecf0f1'; // Reset background color
    }

    function generateAndShowPreview() {
        currentCollageImage = generateCollageImage();

        if (currentCollageImage) {
            zoomLevel = 1.0; // Reset zoom on new generation
            currentCollageImage.onload = () => {
                const originalCollageWidth = currentCollageImage.naturalWidth;
                const originalCollageHeight = currentCollageImage.naturalHeight;

                const containerRect = canvasContainer.getBoundingClientRect();
                let frameWidth = containerRect.width;
                let frameHeight = containerRect.height;

                if (frameWidth <= 0 || frameHeight <= 0) {
                    frameWidth = 800;
                    frameHeight = 450; 
                }

                const scaleRatioFit = Math.min(frameWidth / originalCollageWidth, frameHeight / originalCollageHeight);
                basePreviewWidth = Math.floor(originalCollageWidth * scaleRatioFit);
                basePreviewHeight = Math.floor(originalCollageHeight * scaleRatioFit);

                updateMainPreviewDisplay();
                disableActionButtons(false); // Enable print button
            };
            if (currentCollageImage.complete) {
                currentCollageImage.onload();
            }
        } else {
            disableActionButtons(true); // Disable print button
            clearCanvas();
        }
    }

    function updateMainPreviewDisplay() {
        if (!currentCollageImage) {
            clearCanvas();
            return;
        }

        const displayWidth = Math.floor(basePreviewWidth * zoomLevel);
        const displayHeight = Math.floor(basePreviewHeight * zoomLevel);

        collageCanvas.width = displayWidth;
        collageCanvas.height = displayHeight;
        collageCanvas.style.backgroundColor = 'white'; // Ensure canvas background is white when image is drawn

        ctx.clearRect(0, 0, collageCanvas.width, collageCanvas.height);
        ctx.drawImage(currentCollageImage, 0, 0, displayWidth, displayHeight);

        // No direct scroll region update needed for Canvas, parent overflow handles it.
        // The canvas itself just grows/shrinks as needed.
    }

    // --- Zoom and Pan ---

    collageCanvas.addEventListener('wheel', (event) => {
        event.preventDefault(); // Prevent page scrolling
        if (!currentCollageImage) return;

        const zoomFactor = 1.1; // How much to zoom per step
        const minZoom = 0.2; // Minimum zoom level
        const maxZoom = 5.0; // Maximum zoom level

        const rect = collageCanvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Calculate current image point under mouse
        const currentImageX = mouseX / (collageCanvas.width / (basePreviewWidth * zoomLevel));
        const currentImageY = mouseY / (collageCanvas.height / (basePreviewHeight * zoomLevel));

        if (event.deltaY < 0) { // Zoom in (scroll up)
            zoomLevel = Math.min(zoomLevel * zoomFactor, maxZoom);
        } else { // Zoom out (scroll down)
            zoomLevel = Math.max(zoomLevel / zoomFactor, minZoom);
        }

        updateMainPreviewDisplay();

        // Adjust scroll position to keep mouse point centered
        // This relies on the parent container (canvasContainer) having overflow:scroll
        canvasContainer.scrollLeft += (currentImageX * (collageCanvas.width / (basePreviewWidth * zoomLevel))) - mouseX;
        canvasContainer.scrollTop += (currentImageY * (collageCanvas.height / (basePreviewHeight * zoomLevel))) - mouseY;
    });

    let isDragging = false;
    let lastX, lastY;

    collageCanvas.addEventListener('mousedown', (event) => {
        if (event.button === 0) { // Left mouse button
            isDragging = true;
            lastX = event.clientX;
            lastY = event.clientY;
            collageCanvas.style.cursor = 'grabbing';
            event.preventDefault(); // Prevent default drag behavior
        }
    });

    collageCanvas.addEventListener('mousemove', (event) => {
        if (isDragging) {
            const dx = event.clientX - lastX;
            const dy = event.clientY - lastY;
            canvasContainer.scrollLeft -= dx; // Scroll the container
            canvasContainer.scrollTop -= dy;   // Scroll the container
            lastX = event.clientX;
            lastY = event.clientY;
        }
    });

    collageCanvas.addEventListener('mouseup', () => {
        isDragging = false;
        collageCanvas.style.cursor = 'grab';
    });

    collageCanvas.addEventListener('mouseleave', () => {
        isDragging = false;
        collageCanvas.style.cursor = 'grab';
    });
    
    // Set initial cursor style
    collageCanvas.style.cursor = 'grab';

    // --- Touch Support for Mobile Devices ---

    let touchStartDistance = 0;
    let touchStartZoom = 1.0;
    let isTouchDragging = false;
    let touchLastX = 0;
    let touchLastY = 0;

    // Helper function to get distance between two touch points
    function getTouchDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    collageCanvas.addEventListener('touchstart', (event) => {
        if (!currentCollageImage) return;

        if (event.touches.length === 2) {
            // Two finger pinch to zoom
            event.preventDefault();
            touchStartDistance = getTouchDistance(event.touches[0], event.touches[1]);
            touchStartZoom = zoomLevel;
            isTouchDragging = false;
        } else if (event.touches.length === 1) {
            // Single finger drag
            isTouchDragging = true;
            touchLastX = event.touches[0].clientX;
            touchLastY = event.touches[0].clientY;
        }
    });

    collageCanvas.addEventListener('touchmove', (event) => {
        if (!currentCollageImage) return;

        if (event.touches.length === 2 && touchStartDistance > 0) {
            // Pinch to zoom
            event.preventDefault();
            const currentDistance = getTouchDistance(event.touches[0], event.touches[1]);
            const scale = currentDistance / touchStartDistance;
            
            const minZoom = 0.2;
            const maxZoom = 5.0;
            zoomLevel = Math.max(minZoom, Math.min(maxZoom, touchStartZoom * scale));
            
            updateMainPreviewDisplay();
        } else if (event.touches.length === 1 && isTouchDragging) {
            // Single finger drag
            event.preventDefault();
            const dx = event.touches[0].clientX - touchLastX;
            const dy = event.touches[0].clientY - touchLastY;
            
            canvasContainer.scrollLeft -= dx;
            canvasContainer.scrollTop -= dy;
            
            touchLastX = event.touches[0].clientX;
            touchLastY = event.touches[0].clientY;
        }
    });

    collageCanvas.addEventListener('touchend', (event) => {
        if (event.touches.length < 2) {
            touchStartDistance = 0;
        }
        if (event.touches.length === 0) {
            isTouchDragging = false;
        }
    });

    collageCanvas.addEventListener('touchcancel', () => {
        touchStartDistance = 0;
        isTouchDragging = false;
    });

    // --- Window Resize Handler for Responsive Behavior ---

    let resizeTimeout;
    window.addEventListener('resize', () => {
        // Debounce resize events to avoid excessive recalculations
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (currentCollageImage) {
                // Recalculate base preview size on window resize
                const originalCollageWidth = currentCollageImage.naturalWidth;
                const originalCollageHeight = currentCollageImage.naturalHeight;

                const containerRect = canvasContainer.getBoundingClientRect();
                let frameWidth = containerRect.width;
                let frameHeight = containerRect.height;

                if (frameWidth <= 0 || frameHeight <= 0) {
                    frameWidth = 800;
                    frameHeight = 450;
                }

                const scaleRatioFit = Math.min(frameWidth / originalCollageWidth, frameHeight / originalCollageHeight);
                basePreviewWidth = Math.floor(originalCollageWidth * scaleRatioFit);
                basePreviewHeight = Math.floor(originalCollageHeight * scaleRatioFit);

                // Reset zoom level on resize for better UX
                zoomLevel = 1.0;
                updateMainPreviewDisplay();
            }
        }, 250); // Wait 250ms after resize stops
    });


    // --- Download Function ---

    downloadCollageBtn.addEventListener('click', () => {
        if (!currentCollageImage) {
            showAlert('警告', '請先生成排版預覽！');
            return;
        }

        const filename = outputFilenameInput.value.trim() || 'a4_collage';
        const link = document.createElement('a');
        link.href = currentCollageImage.src;
        link.download = filename + '.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // --- Print Function ---

    printCollageBtn.addEventListener('click', () => {
        if (!currentCollageImage) {
            showAlert('警告', '請先生成排版預覽！');
            return;
        }

        // To print only the collage, open it in a new window/tab.
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                <head>
                    <title>列印排版</title>
                    <style>
                        body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                        img { max-width: 100%; max-height: 100vh; display: block; margin: auto; }
                        @media print {
                            body { margin: 0; padding: 0; }
                            /* For actual A4 print, ensure the image takes up full page */
                            img { 
                                width: 100%; 
                                height: auto; 
                                max-width: none; 
                                max-height: none;
                                page-break-after: always; 
                            }
                        }
                    </style>
                </head>
                <body>
                    <img src="${currentCollageImage.src}" onload="window.print(); window.close();">
                </body>
                </html>
            `);
            printWindow.document.close();
        } else {
            showAlert('錯誤', '無法開啟列印視窗，請檢查您的瀏覽器彈出視窗設定。');
        }
    });

    // Initial state
    disableActionButtons(true);
    clearCanvas();
});