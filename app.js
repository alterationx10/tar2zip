// Function to validate tar header
function validateTarHeader(header) {
    // Check magic number ("ustar" at offset 257)
    const ustarMagic = new TextDecoder().decode(header.slice(257, 262));
    if (ustarMagic !== "ustar") {
        return false;
    }

    // Verify checksum
    const storedChecksum = parseInt(new TextDecoder().decode(header.slice(148, 156)).trim(), 8);
    
    // Calculate checksum: sum of all bytes, with checksum field treated as spaces
    let calculatedChecksum = 0;
    for (let i = 0; i < 512; i++) {
        if (i >= 148 && i < 156) {
            calculatedChecksum += 32; // ASCII space
        } else {
            calculatedChecksum += header[i];
        }
    }
    
    return storedChecksum === calculatedChecksum;
}

// Function to process tar data and create zip
async function processTarToZip(uint8Array, zip) {
    let offset = 0;
    let fileCount = 0;
    const maxConsecutiveErrors = 3;
    let consecutiveErrors = 0;

    while (offset < uint8Array.length) {
        try {
            // Ensure we have enough bytes for a header
            if (offset + 512 > uint8Array.length) {
                throw new Error("Unexpected end of tar file");
            }

            // Read tar header
            const header = uint8Array.slice(offset, offset + 512);
            
            // Check for end of archive (empty block)
            if (header.every(byte => byte === 0)) {
                if (fileCount === 0) {
                    throw new Error("No valid files found in the archive");
                }
                break;
            }

            // Validate tar header
            if (!validateTarHeader(header)) {
                consecutiveErrors++;
                if (consecutiveErrors >= maxConsecutiveErrors) {
                    throw new Error("Multiple invalid headers found - file might be corrupted");
                }
                offset += 512;
                continue;
            }
            consecutiveErrors = 0;

            // Get filename (100 bytes)
            const filename = new TextDecoder().decode(header.slice(0, 100)).trim().replace(/\0/g, '');
            
            // Get file type (1 byte at offset 156)
            const fileType = String.fromCharCode(header[156]);
            
            // Get file size (12 bytes, octal)
            const sizeStr = new TextDecoder().decode(header.slice(124, 136)).trim();
            const size = parseInt(sizeStr, 8);
            
            // Get link name for symbolic links (100 bytes)
            const linkname = new TextDecoder().decode(header.slice(157, 257)).trim().replace(/\0/g, '');

            // Skip PaxHeader entries
            if (filename.includes("PaxHeader")) {
                offset += 512 + (Math.ceil(size / 512) * 512);
                continue;
            }

            // Process file based on type
            switch (fileType) {
                case '0': // Regular file
                case '': // For older tar formats
                    if (size > 0) {
                        // Ensure we have enough bytes for the file content
                        if (offset + 512 + size > uint8Array.length) {
                            throw new Error(`Unexpected end of file while reading ${filename}`);
                        }
                        const content = uint8Array.slice(offset + 512, offset + 512 + size);
                        zip.file(filename, content);
                        fileCount++;
                    }
                    break;

                case '2': // Symbolic link
                    // Store symbolic link as a text file with the link target
                    zip.file(filename, linkname, { comment: "Symbolic Link" });
                    fileCount++;
                    break;

                case '5': // Directory
                    zip.folder(filename);
                    fileCount++;
                    break;

                // Other types (3: character device, 4: block device, 6: fifo) are skipped
            }
            
            // Move to next file (accounting for padding)
            offset += 512 + (Math.ceil(size / 512) * 512);

        } catch (error) {
            // If we encounter an error while processing a file, try to skip to the next one
            if (error.message.includes("Unexpected end")) {
                throw error; // These are fatal errors
            }
            consecutiveErrors++;
            if (consecutiveErrors >= maxConsecutiveErrors) {
                throw new Error(`Failed to process tar file: ${error.message}`);
            }
            // Try to skip to the next 512-byte boundary
            offset = Math.ceil(offset / 512) * 512;
        }
    }

    if (fileCount === 0) {
        throw new Error("No valid files found in the archive");
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