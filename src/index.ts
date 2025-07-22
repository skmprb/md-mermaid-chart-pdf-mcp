#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { marked } from 'marked';
import puppeteer from 'puppeteer';
import matter from 'gray-matter';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

// Create server factory function
function createServer() {
  return new McpServer({
    name: "markdown-pdf-converter",
    version: "1.0.0"
  });
}

class MarkdownToPdfConverter {
  private options: any;
  
  constructor(options = {}) {
    this.options = {
      format: 'A4',
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      displayHeaderFooter: false,
      printBackground: true,
      ...options
    };
  }

  async convert(markdownPath: string, outputPath: string) {
    const markdownContent = await readFile(resolve(markdownPath), 'utf8');
    const { data: frontMatter, content } = matter(markdownContent);
    
    const html = this.generateHtml(content, frontMatter);
    const pdf = await this.htmlToPdf(html);
    
    await writeFile(resolve(outputPath), pdf);
    return resolve(outputPath);
  }

  generateHtml(markdown: string, frontMatter: any = {}) {
    marked.use({
      renderer: {
        code: (token: any) => {
          const code = token.text;
          const language = token.lang;
          if (language === 'mermaid') {
            return `<div class="mermaid">${code}</div>`;
          }
          if (language === 'chart') {
            return `<div class="apex-chart" data-config='${code.replace(/'/g, '&apos;')}'></div>`;
          }
          return `<pre><code class="language-${language || ''}">${code}</code></pre>`;
        }
      },
      gfm: true,
      breaks: false
    });
    
    const htmlContent = marked.parse(markdown);
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${frontMatter.title || 'Document'}</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/apexcharts@3.44.0/dist/apexcharts.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
    
    :root {
      --primary: #2563eb;
      --primary-light: #3b82f6;
      --accent: #f59e0b;
      --success: #10b981;
      --danger: #ef4444;
      --gray-50: #f9fafb;
      --gray-100: #f3f4f6;
      --gray-200: #e5e7eb;
      --gray-600: #4b5563;
      --gray-700: #374151;
      --gray-800: #1f2937;
      --gray-900: #111827;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: var(--gray-800);
      margin: 0;
      padding: 2rem;
      background: linear-gradient(135deg, #fafbfc 0%, #f8fafc 100%);
      position: relative;
    }
    
    body::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, var(--primary) 0%, var(--primary-light) 50%, var(--accent) 100%);
    }
    
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Inter', sans-serif;
      color: var(--gray-900);
      margin: 2em 0 0.8em 0;
      page-break-after: avoid;
      position: relative;
      font-weight: 700;
    }
    
    h1 {
      font-size: 28pt;
      font-weight: 800;
      margin-top: 0;
      color: var(--primary);
      padding-bottom: 0.5em;
      border-bottom: 3px solid var(--primary);
      position: relative;
    }
    
    h1::after {
      content: '';
      position: absolute;
      bottom: -3px;
      left: 0;
      width: 60px;
      height: 3px;
      background: var(--accent);
    }
    
    h2 {
      font-size: 20pt;
      color: var(--gray-800);
      padding-left: 1rem;
      border-left: 4px solid var(--primary);
      background: linear-gradient(90deg, var(--gray-50) 0%, transparent 100%);
      padding: 0.5rem 1rem;
      margin-left: -1rem;
      border-radius: 0 8px 8px 0;
    }
    
    h3 {
      font-size: 16pt;
      color: var(--gray-700);
      position: relative;
      padding-left: 1.5rem;
    }
    
    h3::before {
      content: '▶';
      position: absolute;
      left: 0;
      color: var(--primary);
      font-size: 12pt;
    }
    
    h4 {
      font-size: 12pt;
      color: var(--gray-700);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    p { margin: 0 0 1.2em 0; }
    
    ul, ol { margin: 1em 0; padding-left: 1.5em; }
    li { margin: 0.5em 0; }
    
    ul li::marker { color: var(--primary); font-weight: bold; }
    ol li::marker { color: var(--primary); font-weight: bold; }
    
    blockquote {
      margin: 1.5em 0;
      padding: 1rem 1.5rem;
      border-left: 4px solid var(--accent);
      background: var(--gray-50);
      font-style: italic;
      border-radius: 0 8px 8px 0;
    }
    
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1.5em 0;
      font-size: 11pt;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      overflow: hidden;
    }
    
    th, td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid var(--gray-200);
    }
    
    th {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
      color: white;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-size: 10pt;
    }
    
    tr:nth-child(even) { background: var(--gray-50); }
    
    pre {
      font-family: 'JetBrains Mono', 'SF Mono', Monaco, Consolas, monospace;
      font-size: 10pt;
      background: var(--gray-900);
      color: #e5e7eb;
      padding: 1.5rem;
      margin: 1.5em 0;
      border-radius: 12px;
      overflow-x: auto;
      position: relative;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    
    pre::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4);
      border-radius: 12px 12px 0 0;
    }
    
    code {
      font-family: 'JetBrains Mono', 'SF Mono', Monaco, Consolas, monospace;
      font-size: 10pt;
      background: var(--gray-100);
      color: var(--danger);
      padding: 3px 6px;
      border-radius: 4px;
      font-weight: 500;
    }
    
    pre code { background: transparent; color: inherit; padding: 0; }
    
    .mermaid {
      text-align: center;
      margin: 2em 0;
      padding: 1rem;
      background: var(--gray-50);
      border-radius: 12px;
      border: 2px dashed var(--gray-200);
    }
    
    .apex-chart {
      margin: 2em 0;
      padding: 1rem;
      background: var(--gray-50);
      border-radius: 12px;
      border: 1px solid var(--gray-200);
      width: 100%;
      max-width: 100%;
      overflow: hidden;
      box-sizing: border-box;
      text-align: center;
    }
    
    .apexcharts-canvas {
      max-width: 600px !important;
      max-height: 400px !important;
      width: 100% !important;
      height: auto !important;
      margin: 0 auto !important;
    }
    
    strong {
      font-weight: 600;
      color: var(--gray-900);
      background: linear-gradient(120deg, var(--accent) 0%, transparent 100%);
      background-size: 100% 30%;
      background-repeat: no-repeat;
      background-position: 0 85%;
    }
    
    em { font-style: italic; color: var(--gray-700); }
    
    a {
      color: var(--primary);
      text-decoration: none;
      border-bottom: 1px solid var(--primary);
    }
    
    hr {
      border: none;
      height: 2px;
      background: linear-gradient(90deg, transparent 0%, var(--primary) 50%, transparent 100%);
      margin: 2em 0;
    }
  </style>
</head>
<body>
  ${htmlContent}
  <script>
    mermaid.initialize({ startOnLoad: true, theme: 'default' });
    
    // Initialize ApexCharts
    document.addEventListener('DOMContentLoaded', function() {
      document.querySelectorAll('.apex-chart').forEach((element, index) => {
        try {
          const config = JSON.parse(element.getAttribute('data-config'));
          
          const responsiveConfig = {
            ...config,
            chart: {
              ...config.chart,
              width: 600,
              height: config.chart?.height || 350,
              animations: { enabled: false },
              toolbar: { show: false },
              zoom: { enabled: false }
            },
            legend: {
              ...config.legend,
              position: 'bottom'
            }
          };
          
          const chart = new ApexCharts(element, responsiveConfig);
          chart.render();
        } catch (error) {
          console.error('ApexCharts error:', error);
          element.innerHTML = '<p style="color: red;">Chart rendering error</p>';
        }
      });
    });
  </script>
</body>
</html>`;
  }

  async htmlToPdf(html: string) {
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
    });
    
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: 'networkidle2' });
      
      await Promise.race([
        page.evaluateHandle('document.fonts.ready'),
        new Promise(resolve => setTimeout(resolve, 5000))
      ]);
      
      // Disable animations and ensure complete rendering
      await page.evaluate(() => {
        if ((window as any).ApexCharts) {
          Object.values((window as any).ApexCharts.instances || {}).forEach((chart: any) => {
            if (chart && chart.updateOptions) {
              chart.updateOptions({
                chart: { animations: { enabled: false } }
              });
            }
          });
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        await page.waitForFunction(() => {
          const mermaidElements = document.querySelectorAll('.mermaid');
          const chartElements = document.querySelectorAll('.apexcharts-canvas');
          const mermaidReady = mermaidElements.length === 0 || 
                              Array.from(mermaidElements).every(el => el.querySelector('svg'));
          const chartsReady = chartElements.length === 0 || 
                             Array.from(chartElements).every(el => el.querySelector('svg'));
          return mermaidReady && chartsReady;
        }, { timeout: 10000 });
      } catch (e) {
        console.error('Chart rendering timeout, proceeding anyway');
      }
      
      return await page.pdf({
        format: this.options.format as any,
        margin: this.options.margin,
        displayHeaderFooter: this.options.displayHeaderFooter,
        printBackground: this.options.printBackground,
        tagged: true,
        outline: true
      });
    } finally {
      await browser.close();
    }
  }
}

// Setup server tools function
function setupServer(server: McpServer) {
  // Register markdown to PDF conversion tool
  server.registerTool(
    "convert_markdown_to_pdf",
    {
      title: "Convert Markdown File to PDF",
      description: "Convert a markdown file to PDF",
      inputSchema: {
        markdownPath: z.string().describe("Path to the markdown file to convert"),
        outputPath: z.string().describe("Path where the PDF should be saved"),
        format: z.enum(['A4', 'A3', 'A5', 'Letter', 'Legal', 'Tabloid']).optional().describe("PDF page format (default: A4)"),
        margin: z.object({
          top: z.string().optional(),
          right: z.string().optional(),
          bottom: z.string().optional(),
          left: z.string().optional()
        }).optional().describe("PDF margins (e.g., '0.5in', '20mm')")
      }
    },
    async ({ markdownPath, outputPath, format, margin }) => {
      try {
        const options: any = {};
        if (format) options.format = format;
        if (margin) options.margin = margin;

        const converter = new MarkdownToPdfConverter(options);
        const resultPath = await converter.convert(markdownPath, outputPath);

        return {
          content: [
            {
              type: "text",
              text: `Successfully converted markdown to PDF!\nInput: ${markdownPath}\nOutput: ${resultPath}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error converting markdown to PDF: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );

  // Register markdown content to PDF tool
  server.registerTool(
    "markdown_content_to_pdf",
    {
      title: "Convert Markdown Content to PDF",
      description: "Convert markdown content directly to PDF",
      inputSchema: {
        markdownContent: z.string().describe("Markdown content to convert"),
        outputPath: z.string().describe("Path where the PDF should be saved"),
        title: z.string().optional().describe("Document title for the PDF"),
        format: z.enum(['A4', 'A3', 'A5', 'Letter', 'Legal', 'Tabloid']).optional().describe("PDF page format (default: A4)"),
        margin: z.object({
          top: z.string().optional(),
          right: z.string().optional(),
          bottom: z.string().optional(),
          left: z.string().optional()
        }).optional().describe("PDF margins (e.g., '0.5in', '20mm')")
      }
    },
    async ({ markdownContent, outputPath, title, format, margin }) => {
      try {
        const options: any = {};
        if (format) options.format = format;
        if (margin) options.margin = margin;

        const converter = new MarkdownToPdfConverter(options);
        const frontMatter = title ? { title } : {};
        const html = converter.generateHtml(markdownContent, frontMatter);
        const pdf = await converter.htmlToPdf(html);
        
        await writeFile(resolve(outputPath), pdf);
        const resultPath = resolve(outputPath);

        return {
          content: [
            {
              type: "text",
              text: `Successfully converted markdown content to PDF!\nOutput: ${resultPath}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error converting markdown content to PDF: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
}

// Stdio transport (default)
async function runStdio() {
  const server = createServer();
  setupServer(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Markdown to PDF MCP Server running on stdio");
}

// HTTP transport with session management
async function runHttp(port: number = 3000) {
  const app = express();
  app.use(express.json());
  app.use(cors({
    origin: '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id'],
  }));

  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          transports[sessionId] = transport;
        },
        enableDnsRebindingProtection: true,
        allowedHosts: ['127.0.0.1', 'localhost']
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };

      const server = createServer();
      setupServer(server);
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };

  app.get('/mcp', handleSessionRequest);
  app.delete('/mcp', handleSessionRequest);

  app.listen(port, () => {
    console.error(`Markdown to PDF MCP Server running on HTTP port ${port}`);
  });
}

// SSE transport (legacy support)
async function runSSE(port: number = 3001) {
  const app = express();
  app.use(express.json());
  app.use(cors());

  const transports: { [sessionId: string]: SSEServerTransport } = {};

  app.get('/sse', async (req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;
    
    res.on("close", () => {
      delete transports[transport.sessionId];
    });
    
    const server = createServer();
    setupServer(server);
    await server.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports[sessionId];
    if (transport) {
      await transport.handlePostMessage(req, res, req.body);
    } else {
      res.status(400).send('No transport found for sessionId');
    }
  });

  app.listen(port, () => {
    console.error(`Markdown to PDF MCP Server running on SSE port ${port}`);
  });
}

// Main function to handle different transport modes
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'stdio';
  const port = parseInt(args[1]) || undefined;

  switch (mode) {
    case 'http':
      await runHttp(port);
      break;
    case 'sse':
      await runSSE(port);
      break;
    case 'stdio':
    default:
      await runStdio();
      break;
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});