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
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

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
    let markdownContent: string;
    
    if (this.isUrl(markdownPath)) {
      markdownContent = await this.downloadFile(markdownPath);
    } else {
      markdownContent = await readFile(resolve(markdownPath), 'utf8');
    }
    
    const { data: frontMatter, content } = matter(markdownContent);
    
    const html = this.generateHtml(content, frontMatter);
    const pdf = await this.htmlToPdf(html);
    
    await writeFile(resolve(outputPath), pdf);
    return resolve(outputPath);
  }

  private isUrl(path: string): boolean {
    return path.startsWith('http://') || path.startsWith('https://');
  }

  private async downloadFile(url: string): Promise<string> {
    if (this.isS3Url(url)) {
      return await this.downloadFromS3(url);
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file from ${url}: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  }

  private isS3Url(url: string): boolean {
    return url.includes('.s3.') || url.includes('s3.amazonaws.com') || url.startsWith('s3://');
  }

  private async downloadFromS3(url: string): Promise<string> {
    const { bucket, key } = this.parseS3Url(url);
    
    const s3Client = new S3Client({});
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    
    const response = await s3Client.send(command);
    return await response.Body?.transformToString() || '';
  }

  private parseS3Url(url: string): { bucket: string; key: string } {
    if (url.startsWith('s3://')) {
      const parts = url.slice(5).split('/');
      return { bucket: parts[0], key: parts.slice(1).join('/') };
    }
    
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.slice(1).split('/');
    
    if (urlObj.hostname.includes('.s3.')) {
      const bucket = urlObj.hostname.split('.s3.')[0];
      return { bucket, key: pathParts.join('/') };
    }
    
    if (urlObj.hostname === 's3.amazonaws.com') {
      return { bucket: pathParts[0], key: pathParts.slice(1).join('/') };
    }
    
    throw new Error(`Invalid S3 URL format: ${url}`);
  }

  async downloadFromS3Direct(bucket: string, key: string, region?: string): Promise<string> {
    const s3Client = new S3Client({ region: region || 'us-east-1' });
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    
    const response = await s3Client.send(command);
    return await response.Body?.transformToString() || '';
  }

  async uploadToS3(bucket: string, key: string, pdfBuffer: Buffer, region?: string): Promise<void> {
    const s3Client = new S3Client({ region: region || 'us-east-1' });
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf'
    });
    
    await s3Client.send(command);
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
        },
        link: (token: any) => {
          const href = token.href;
          const title = token.title ? ` title="${token.title}"` : '';
          const text = token.text;
          
          // Ensure proper link formatting for PDF
          return `<a href="${href}"${title} style="color: #0066cc; text-decoration: underline; word-break: break-all;">${text}</a>`;
        },
        heading: (token: any) => {
          const level = token.depth;
          const text = token.text;
          const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
          
          return `<h${level} id="${id}">${text}</h${level}>`;
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
    @page {
      size: A4;
      margin: 1.5cm 2cm;
    }
    body {
      font-family: Arial, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #333;
      margin: 0;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 10px;
      margin-bottom: 16px;
      border-bottom: 1px solid #ccc;
      padding-bottom: 10px;
    }
    header img {
      width: 16px;
      height: 16px;
      border-radius: 6px;
    }
    header strong {
      font-size: 18px;
      color: #1e3c72;
      font-weight: bold;
    }
    .meta-info {
      background: #e3f2fd;
      border: 1px solid #bbdefb;
      border-left: 4px solid #2196f3;
      padding: 15px;
      margin: 15px 0 20px 0;
      font-size: 12px;
    }
    .meta-info p {
      margin: 4px 0;
    }
    .meta-label {
      font-weight: bold;
      color: #1565c0;
      margin-right: 8px;
    }
    h1 {
      font-size: 18px;
      color: #00187C;
      margin: 25px 0 15px 0;
      padding-bottom: 8px;
      border-bottom: 2px solid #00187C;
    }
    h2 {
      font-size: 16px;
      color: Black;
      background: #e3f2fd;
      margin: 20px 0 12px 0;
      padding: 10px 15px;
      border-radius: 4px;
    }
    h3 {
      font-size: 14px;
      color: #00187C;
      margin: 16px 0 10px 0;
    }
    h4, h5, h6 {
      font-size: 12px;
      color: #00AAFF;
      margin: 12px 0 8px 0;
    }
    p { margin: 8px 0; text-align: justify; }
    ul, ol { margin: 10px 0; padding-left: 25px; }
    li { margin-bottom: 5px; line-height: 1.4; }
    pre {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      padding: 12px;
      font-size: 10px;
      font-family: monospace;
      margin: 12px 0;
    }
    code {
      background: #f1f3f4;
      font-size: 10px;
      font-family: monospace;
      padding: 2px 4px;
      border: 1px solid #e1e5e9;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 15px 0;
      font-size: 10px;
    }
    th {
      background: #495057;
      color: white;
      font-weight: bold;
      padding: 8px 6px;
      text-align: left;
      border: 1px solid #dee2e6;
    }
    td {
      padding: 6px;
      border: 1px solid #dee2e6;
      vertical-align: top;
    }
    blockquote {
      border-left: 4px solid #007bff;
      background: #f8f9fa;
      margin: 15px 0;
      padding: 10px 15px;
      font-style: italic;
      color: #495057;
    }
    a {
      color: #0066cc;
      text-decoration: underline;
      word-break: break-all;
    }
    a:hover {
      color: #004499;
      text-decoration: underline;
    }
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 20px 0;
    }
    .use-case-separator {
      border-top: 1px solid #e0e0e0;
      margin: 25px 0;
      padding-top: 0;
    }
    .mermaid {
      text-align: center;
      margin: 1.5em 0;
      padding: 1rem;
      background: #ffffff;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      page-break-inside: avoid;
    }
    .mermaid svg {
      max-width: 100% !important;
      max-height: 400px !important;
      height: auto !important;
      font-family: 'Inter', 'Segoe UI', sans-serif !important;
    }
    .apex-chart {
      margin: 2em 0;
      padding: 1rem;
      background: #ffffff;
      border-radius: 12px;
      border: 1px solid #e0e0e0;
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
  </style>
</head>
<body>
  <header>
    <img src="https://pbs.twimg.com/profile_images/1650467305833529344/WN63xX4Y.jpg" alt="Helio Cloud Platform"/>
    <strong>HCP – Requirements Generator & Analyzer Report</strong>
  </header>
  <hr>
  <div class="meta-info">
    <p><span class="meta-label">Document:</span> ${frontMatter.title || 'Markdown Document'}</p>
    <p><span class="meta-label">Generated:</span> ${new Date().toLocaleString()}</p>
  </div>
  ${htmlContent}
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: "base",
      themeVariables: {
        background: "#ffffff",
        primaryColor: "#eef2f7",
        primaryBorderColor: "#a0aec0",
        primaryTextColor: "#1f2d3d",
        secondaryColor: "#e2e8f0",
        tertiaryColor: "#cbd5e1",
        lineColor: "#64748b",
        textColor: "#2d3748",
        nodeTextColor: "#1f2d3d",
        edgeLabelBackground: "#f1f5f9",
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji",
        fontSize: "13px"
      },
      themeCSS: 'svg { background: #ffffff; } .label, .nodeLabel, .edgeLabel { font-weight: 500; fill: #2d3748; } .node rect, .node circle, .node polygon { fill: #eef2f7; stroke: #a0aec0; stroke-width: 1.3px; rx: 10; ry: 10; filter: drop-shadow(0 3px 10px rgba(0,0,0,0.07)); } .edgePath .path { stroke: #64748b; stroke-width: 1.6px; stroke-linecap: round; } .cluster rect { fill: #e2e8f0 !important; stroke: #a0aec0 !important; rx: 12; ry: 12; } .title { font-weight: 600; fill: #1f2d3d; } .marker { fill: #64748b; } .note { fill: #cbd5e1; stroke: #a0aec0; color: #2d3748; }',
      flowchart: {
        nodeSpacing: 50,
        rankSpacing: 60
      }
    });
    
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
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--font-render-hinting=none',
        '--max-old-space-size=4096',
        '--disable-dev-shm-usage',
        '--enable-features=VaapiVideoDecoder',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
      
      // Set longer timeout for large content
      page.setDefaultTimeout(60000);
      page.setDefaultNavigationTimeout(60000);
      
      await page.setContent(html, { 
        waitUntil: 'networkidle0',
        timeout: 60000
      });
      
      await Promise.race([
        page.evaluateHandle('document.fonts.ready'),
        new Promise(resolve => setTimeout(resolve, 10000))
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
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        await page.waitForFunction(() => {
          const mermaidElements = document.querySelectorAll('.mermaid');
          const chartElements = document.querySelectorAll('.apexcharts-canvas');
          const mermaidReady = mermaidElements.length === 0 || 
                              Array.from(mermaidElements).every(el => el.querySelector('svg'));
          const chartsReady = chartElements.length === 0 || 
                             Array.from(chartElements).every(el => el.querySelector('svg'));
          return mermaidReady && chartsReady;
        }, { timeout: 30000 });
      } catch (e) {
        console.error('Chart rendering timeout, proceeding anyway');
      }
      
      // Ensure all links are properly formatted for PDF
      await page.evaluate(() => {
        // Add proper attributes to all links for PDF compatibility
        document.querySelectorAll('a[href]').forEach((link: any) => {
          const href = link.getAttribute('href');
          if (href) {
            // Ensure the link has proper styling and attributes
            link.style.color = '#0066cc';
            link.style.textDecoration = 'underline';
            link.style.wordBreak = 'break-all';
            
            // Add title attribute if not present for better PDF compatibility
            if (!link.title && href.startsWith('http')) {
              link.title = href;
            }
          }
        });
      });
      
      return await page.pdf({
        format: this.options.format as any,
        margin: this.options.margin,
        displayHeaderFooter: this.options.displayHeaderFooter,
        printBackground: this.options.printBackground,
        tagged: true,
        outline: true,
        timeout: 120000,
        // These options help preserve links in PDF
        preferCSSPageSize: true,
        omitBackground: false
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
        markdownPath: z.string().describe("Path to the markdown file to convert (local path or URL)"),
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

  // Register S3 markdown to PDF tool
  server.registerTool(
    "convert_s3_markdown_to_pdf",
    {
      title: "Convert S3 Markdown File to PDF",
      description: "Convert a markdown file from S3 bucket to PDF using bucket and key parameters",
      inputSchema: {
        bucket: z.string().describe("S3 bucket name"),
        key: z.string().describe("S3 object key (path to the markdown file)"),
        outputPath: z.string().describe("Path where the PDF should be saved (local path or S3 key for upload)"),
        uploadToS3: z.boolean().optional().describe("Whether to upload the PDF back to the same S3 bucket (default: false)"),
        region: z.string().optional().describe("AWS region (defaults to us-east-1)"),
        format: z.enum(['A4', 'A3', 'A5', 'Letter', 'Legal', 'Tabloid']).optional().describe("PDF page format (default: A4)"),
        margin: z.object({
          top: z.string().optional(),
          right: z.string().optional(),
          bottom: z.string().optional(),
          left: z.string().optional()
        }).optional().describe("PDF margins (e.g., '0.5in', '20mm')")
      }
    },
    async ({ bucket, key, outputPath, region, format, margin, uploadToS3 }) => {
      try {
        const options: any = {};
        if (format) options.format = format;
        if (margin) options.margin = margin;

        const converter = new MarkdownToPdfConverter(options);
        const markdownContent = await converter.downloadFromS3Direct(bucket, key, region);
        const { data: frontMatter, content } = matter(markdownContent);
        
        const html = converter.generateHtml(content, frontMatter);
        const pdf = await converter.htmlToPdf(html);
        
        let resultPath: string;
        
        if (uploadToS3) {
          await converter.uploadToS3(bucket, outputPath, Buffer.from(pdf), region);
          resultPath = `s3://${bucket}/${outputPath}`;
        } else {
          await writeFile(resolve(outputPath), pdf);
          resultPath = resolve(outputPath);
        }

        return {
          content: [
            {
              type: "text",
              text: `Successfully converted S3 markdown to PDF!\nBucket: ${bucket}\nKey: ${key}\nOutput: ${resultPath}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error converting S3 markdown to PDF: ${error instanceof Error ? error.message : String(error)}`
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
        markdownContent: z.union([
          z.string(),
          z.object({
            content: z.string(),
            chunks: z.array(z.string()).optional()
          })
        ]).describe("Markdown content to convert (string or JSON object with content/chunks)"),
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
        
        let content: string;
        if (typeof markdownContent === 'string') {
          content = markdownContent;
        } else {
          content = markdownContent.content;
          if (markdownContent.chunks) {
            content += '\n\n' + markdownContent.chunks.join('\n\n');
          }
        }
        
        const html = converter.generateHtml(content, frontMatter);
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
        enableDnsRebindingProtection: false
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

// Export the converter class for external use
export { MarkdownToPdfConverter };

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});