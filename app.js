// Function to process tar data and create zip
async function processTarToZip(uint8Array, zip) {
    let offset = 0;
    while (offset < uint8Array.length) {
        // Read tar header
        const header = uint8Array.slice(offset, offset + 512);
        
        // Check for end of archive (empty block)
        if (header.every(byte => byte === 0)) {
            break;
        }
        
        // Get filename (100 bytes)
        const filename = new TextDecoder().decode(header.slice(0, 100)).trim().replace(/\0/g, '');
        
        // Get file type (1 byte at offset 156)
        const fileType = String.fromCharCode(header[156]);
        
        // Get file size (12 bytes, octal)
        const sizeStr = new TextDecoder().decode(header.slice(124, 136)).trim();
        const size = parseInt(sizeStr, 8);
        
        // Skip PaxHeader entries and process only regular files
        if (size > 0 && !filename.includes("PaxHeader") && fileType === '0') {
            // Get file content
            const content = uint8Array.slice(offset + 512, offset + 512 + size);
            
            // Add to ZIP
            zip.file(filename, content);
        }
        
        // Move to next file (accounting for padding)
        offset += 512 + (Math.ceil(size / 512) * 512);
    }
    return zip;
}

// Function to handle the file conversion
async function convertToZip(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        let uint8Array = new Uint8Array(arrayBuffer);
        
        // Check if it's a gzipped file
        const isGzipped = uint8Array[0] === 0x1f && uint8Array[1] === 0x8b;
        
        // Create a new ZIP
        const zip = new JSZip();
        
        // If it's a gzipped tar, decompress it first
        if (isGzipped) {
            try {
                updateProgress(0, 'Decompressing gzip...');
                // Decompress the gzipped data
                uint8Array = pako.inflate(uint8Array);
                updateProgress(30, 'Processing tar contents...');
            } catch (error) {
                throw new Error('Failed to decompress gzip file. The file might be corrupted.');
            }
        }

        // Process the tar file (whether it was originally gzipped or not)
        await processTarToZip(uint8Array, zip);
        
        updateProgress(60, 'Creating zip file...');
        
        // Generate ZIP file
        const zipBlob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 }
        }, (metadata) => {
            // Scale the progress from 60 to 100
            updateProgress(60 + (metadata.percent * 0.4));
        });
        
        // Create download link
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name.replace(/\.(tar|tar\.gz|tgz)$/, '.zip');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        updateProgress(100, 'Conversion complete!');
        setTimeout(() => {
            hideProgress();
        }, 2000);
        
    } catch (error) {
        showError(error.message);
        hideProgress();
    }
}

// UI Event Handlers
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const progressContainer = document.querySelector('.progress-container');
const progressBar = document.getElementById('progress');
const progressText = document.getElementById('progressText');
const errorElement = document.getElementById('error');

function updateProgress(percent, text) {
    progressContainer.style.display = 'block';
    progressBar.style.width = `${percent}%`;
    if (text) {
        progressText.textContent = text;
    } else {
        progressText.textContent = `Converting... ${Math.round(percent)}%`;
    }
}

function hideProgress() {
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
}

function showError(message) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 5000);
}

// File input change handler
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        errorElement.style.display = 'none';
        updateProgress(0, 'Starting conversion...');
        convertToZip(file);
    }
});

// Drag and drop handlers
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.tar') || file.name.endsWith('.tar.gz') || file.name.endsWith('.tgz'))) {
        errorElement.style.display = 'none';
        updateProgress(0, 'Starting conversion...');
        convertToZip(file);
    } else {
        showError('Please upload a .tar or .tar.gz file');
    }
}); 