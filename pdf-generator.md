# Semantic HTML for PDF Generation: A Developer's Guide

## Overview

When generating PDFs from HTML (using libraries like Puppeteer, wkhtmltopdf, or Prince XML), proper semantic markup is crucial for creating high-quality, accessible, and well-structured documents. This guide covers best practices for HTML structure that translates effectively to PDF format.

## Why Semantic HTML Matters for PDFs

- **Accessibility**: Screen readers and assistive technologies can navigate PDF structure
- **Document Navigation**: Proper headings create automatic bookmarks and table of contents
- **Print Optimization**: Semantic elements behave predictably across PDF engines
- **SEO & Indexing**: PDFs with good structure are more searchable
- **Professional Appearance**: Better typography and layout control

## Essential Semantic Elements

### Document Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Document Title</title>
    <style>
        /* PDF-specific styles here */
    </style>
</head>
<body>
    <header>
        <h1>Main Document Title</h1>
        <p>Document metadata, date, author</p>
    </header>
    
    <main>
        <section>
            <h2>Section Title</h2>
            <p>Content goes here...</p>
        </section>
    </main>
    
    <footer>
        <p>Page footer content</p>
    </footer>
</body>
</html>
```

### Heading Hierarchy

```html
<!-- ✅ GOOD: Proper hierarchy -->
<h1>Document Title</h1>
<h2>Chapter 1</h2>
<h3>Section 1.1</h3>
<h3>Section 1.2</h3>
<h2>Chapter 2</h2>

<!-- ❌ BAD: Skipped levels -->
<h1>Document Title</h1>
<h3>Some Section</h3> <!-- Skipped h2 -->
```

### Content Organization

```html
<main>
    <article>
        <header>
            <h2>Article Title</h2>
            <time datetime="2024-01-15">January 15, 2024</time>
            <address>By John Doe</address>
        </header>
        
        <section>
            <h3>Introduction</h3>
            <p>Article content...</p>
        </section>
        
        <section>
            <h3>Main Content</h3>
            <p>More content...</p>
            
            <blockquote cite="https://example.com">
                <p>"This is a quoted passage."</p>
                <footer>— <cite>Source Name</cite></footer>
            </blockquote>
        </section>
    </article>
</main>
```

## Lists and Navigation

### Table of Contents

```html
<nav aria-label="Table of Contents">
    <h2>Contents</h2>
    <ol>
        <li><a href="#introduction">Introduction</a></li>
        <li><a href="#methodology">Methodology</a>
            <ol>
                <li><a href="#data-collection">Data Collection</a></li>
                <li><a href="#analysis">Analysis</a></li>
            </ol>
        </li>
        <li><a href="#results">Results</a></li>
        <li><a href="#conclusion">Conclusion</a></li>
    </ol>
</nav>
```

### Definition Lists

```html
<dl>
    <dt>API</dt>
    <dd>Application Programming Interface</dd>
    
    <dt>CSS</dt>
    <dd>Cascading Style Sheets</dd>
    
    <dt>HTML</dt>
    <dd>HyperText Markup Language</dd>
</dl>
```

## Tables for Data

```html
<table>
    <caption>Quarterly Sales Report 2024</caption>
    <thead>
        <tr>
            <th scope="col">Quarter</th>
            <th scope="col">Revenue</th>
            <th scope="col">Growth</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <th scope="row">Q1</th>
            <td>$1.2M</td>
            <td>+15%</td>
        </tr>
        <tr>
            <th scope="row">Q2</th>
            <td>$1.5M</td>
            <td>+25%</td>
        </tr>
    </tbody>
    <tfoot>
        <tr>
            <th scope="row">Total</th>
            <td>$2.7M</td>
            <td>+20%</td>
        </tr>
    </tfoot>
</table>
```

## PDF-Optimized CSS

### Print Media Queries

```css
/* Base styles for screen and print */
body {
    font-family: Georgia, serif;
    line-height: 1.6;
    color: #333;
}

/* PDF/Print specific styles */
@media print {
    @page {
        size: A4;
        margin: 1in;
        
        @top-center {
            content: "Document Title";
        }
        
        @bottom-center {
            content: "Page " counter(page) " of " counter(pages);
        }
    }
    
    /* Page breaks */
    h1, h2, h3 {
        page-break-after: avoid;
        page-break-inside: avoid;
    }
    
    img, table, figure {
        page-break-inside: avoid;
    }
    
    /* Avoid widows and orphans */
    p {
        orphans: 3;
        widows: 3;
    }
    
    /* Link styling for print */
    a[href]:after {
        content: " (" attr(href) ")";
        font-size: 0.8em;
        color: #666;
    }
    
    /* Hide interactive elements */
    button, input, select, textarea {
        display: none;
    }
}
```

### Typography for PDFs

```css
/* Optimize fonts for PDF rendering */
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Georgia, serif;
    font-size: 12pt; /* Use pt units for print */
    line-height: 1.4;
}

h1 { font-size: 24pt; margin: 0 0 18pt 0; }
h2 { font-size: 18pt; margin: 18pt 0 12pt 0; }
h3 { font-size: 14pt; margin: 12pt 0 6pt 0; }

p { margin: 0 0 12pt 0; }

/* Table styling */
table {
    width: 100%;
    border-collapse: collapse;
    margin: 12pt 0;
}

th, td {
    border: 1px solid #ddd;
    padding: 8pt;
    text-align: left;
}

th {
    background-color: #f5f5f5;
    font-weight: bold;
}
```

## Elements to Avoid in PDFs

### ❌ Don't Use These

```html
<!-- Avoid generic containers when semantic alternatives exist -->
<div class="heading">Title</div> <!-- Use <h1-h6> instead -->
<div class="paragraph">Text</div> <!-- Use <p> instead -->

<!-- Avoid interactive elements -->
<button>Click me</button>
<input type="text">
<select><option>Choose</option></select>

<!-- Avoid complex positioning -->
<div style="position: absolute; top: 50px;">Content</div>
<div style="float: left;">Floating content</div>
```

### ✅ Use These Instead

```html
<!-- Proper semantic elements -->
<h1>Title</h1>
<p>Text content</p>

<!-- Static alternatives -->
<p><strong>Action:</strong> Submit form</p>
<p><strong>Selection:</strong> Option A</p>

<!-- Standard document flow -->
<section>
    <h2>Section Title</h2>
    <p>Content in normal document flow</p>
</section>
```

## Complete Example Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Professional Report Template</title>
    <style>
        /* Include CSS from above sections */
    </style>
</head>
<body>
    <header>
        <h1>Annual Report 2024</h1>
        <address>
            Prepared by: Development Team<br>
            <time datetime="2024-12-01">December 1, 2024</time>
        </address>
    </header>

    <nav aria-label="Table of Contents">
        <h2>Table of Contents</h2>
        <ol>
            <li><a href="#executive-summary">Executive Summary</a></li>
            <li><a href="#financial-overview">Financial Overview</a></li>
            <li><a href="#future-outlook">Future Outlook</a></li>
        </ol>
    </nav>

    <main>
        <section id="executive-summary">
            <h2>Executive Summary</h2>
            <p>This section provides an overview...</p>
        </section>

        <section id="financial-overview">
            <h2>Financial Overview</h2>
            <table>
                <caption>Revenue by Quarter</caption>
                <!-- Table content -->
            </table>
        </section>

        <section id="future-outlook">
            <h2>Future Outlook</h2>
            <p>Looking ahead to 2025...</p>
        </section>
    </main>

    <footer>
        <p>© 2024 Company Name. All rights reserved.</p>
    </footer>
</body>
</html>
```

## Testing Your PDF Output

### Validation Checklist

- [ ] **Heading hierarchy**: No skipped levels (h1 → h2 → h3)
- [ ] **Table of contents**: Auto-generated from headings
- [ ] **Page breaks**: Appropriate breaks, no orphaned headings
- [ ] **Accessibility**: Screen reader compatible
- [ ] **Links**: Functional in PDF (if needed)
- [ ] **Images**: Proper alt text and sizing
- [ ] **Tables**: Clear headers and structure

### Testing Tools

1. **Browser Dev Tools**: Use print preview
2. **PDF Generators**: Test with your target library
3. **Accessibility**: Use screen reader testing
4. **Validation**: W3C HTML validator

## Common PDF Generation Libraries

### Puppeteer Example

```javascript
const puppeteer = require('puppeteer');

async function generatePDF() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    await page.setContent(htmlContent);
    
    const pdf = await page.pdf({
        format: 'A4',
        margin: {
            top: '1in',
            right: '1in',
            bottom: '1in',
            left: '1in'
        },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div style="font-size:10px; width:100%; text-align:center;">Document Title</div>',
        footerTemplate: '<div style="font-size:10px; width:100%; text-align:center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
    });
    
    await browser.close();
    return pdf;
}
```

## Best Practices Summary

1. **Use proper semantic HTML** - Don't rely on CSS for structure
2. **Maintain heading hierarchy** - Essential for navigation
3. **Test early and often** - PDF rendering can be unpredictable
4. **Optimize for accessibility** - Benefits everyone
5. **Keep layouts simple** - Complex CSS may not translate well
6. **Use print-specific CSS** - @media print is your friend
7. **Validate your HTML** - Clean markup = better PDFs

## Resources

- [W3C HTML Specification](https://html.spec.whatwg.org/)
- [MDN Web Docs - HTML Elements](https://developer.mozilla.org/en-US/docs/Web/HTML/Element)
- [CSS Paged Media Module](https://www.w3.org/TR/css-page-3/)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

*Happy PDF generating! 🚀*