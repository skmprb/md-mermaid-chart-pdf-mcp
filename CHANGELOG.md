# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2024-12-19

### Added
- **MCP SDK 1.16.x Support**: Updated to latest Model Context Protocol SDK
- **Multiple Transport Modes**: 
  - stdio (default) - Perfect for Claude Desktop
  - Streamable HTTP - Modern web applications with session management
  - SSE (Server-Sent Events) - Legacy compatibility
- **Enhanced Security**: DNS rebinding protection for HTTP transport
- **CORS Support**: Browser-friendly with proper headers
- **Session Management**: Stateful HTTP sessions with automatic cleanup
- **Professional PDF Styling**: Modern typography with Inter font
- **Mermaid Diagram Support**: Flowcharts, sequence diagrams, and more
- **ApexCharts Integration**: Interactive charts in PDFs
- **Multiple Page Formats**: A4, A3, A5, Letter, Legal, Tabloid
- **Configurable Margins**: Custom spacing in inches, mm, cm
- **Front Matter Support**: YAML metadata for document properties
- **Accessibility Features**: Tagged PDFs with proper outline structure
- **Syntax Highlighting**: 100+ programming languages supported
- **Docker Support**: Production-ready containerization
- **PM2 Integration**: Process management for production
- **Cloud Deployment**: Examples for AWS Lambda, Vercel, Netlify

### Technical Improvements
- **registerTool API**: Updated to use modern MCP SDK 1.16.x API
- **Error Handling**: Comprehensive error handling across all transport modes
- **Performance Optimization**: Improved PDF generation speed and memory usage
- **TypeScript Support**: Full TypeScript implementation with proper types
- **Modular Architecture**: Separated server creation and setup functions
- **Environment Configuration**: Support for environment variables
- **Health Checks**: Built-in health monitoring endpoints
- **Debug Mode**: Comprehensive logging and debugging support

### Documentation
- **Comprehensive README**: Detailed documentation with examples
- **API Documentation**: Complete MCP protocol and HTTP/SSE endpoint docs
- **Deployment Guides**: Multiple deployment scenarios covered
- **Troubleshooting**: Common issues and solutions
- **Performance Guide**: Optimization tips and scaling considerations
- **Configuration Examples**: Real-world configuration samples

### Dependencies
- **@modelcontextprotocol/sdk**: Updated to ^1.16.0
- **express**: Added ^4.18.2 for HTTP transport
- **cors**: Added ^2.8.5 for CORS support
- **zod**: ^3.23.8 for schema validation
- **marked**: ^14.1.3 for Markdown parsing
- **puppeteer**: ^23.10.4 for PDF generation
- **gray-matter**: ^4.0.3 for front matter parsing

### Scripts
- `npm start`: Run in stdio mode (default)
- `npm run start:http`: Run HTTP server on port 3000
- `npm run start:sse`: Run SSE server on port 3001
- `npm run build`: Compile TypeScript to JavaScript

## [0.1.0] - Initial Release

### Added
- Basic Markdown to PDF conversion
- Simple MCP server implementation
- Basic styling and formatting