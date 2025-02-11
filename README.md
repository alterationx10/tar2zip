# Tar2Zip Converter

A web-based tool that converts .tar and .tar.gz files to .zip format directly in your browser. No server upload required - all processing happens locally in your browser for maximum privacy and security.

## Features

- Convert .tar files to .zip format
- Modern, drag-and-drop interface
- 100% client-side processing
- No file size limits (other than browser memory constraints)
- Progress indication during conversion
- Automatic download of converted files

## Usage

1. Open `index.html` in your web browser
2. Drag and drop a .tar file onto the interface, or click to select a file
3. Wait for the conversion to complete
4. The converted .zip file will automatically download

## Technical Details

This tool uses the following technologies:
- Pure JavaScript for file processing
- JSZip library for creating ZIP files
- Modern Web APIs (File API, Drag and Drop API)
- No external dependencies or server requirements

## Browser Compatibility

Works in all modern browsers that support:
- File API
- Drag and Drop API
- async/await
- TextDecoder

## Development

To modify or enhance this tool:

1. Clone the repository
2. Make your changes to the source files:
   - `index.html` - Main interface
   - `styles.css` - Styling
   - `app.js` - Application logic
3. Test in a web browser

