# Credits

Third-party design and code this repository reuses, with the notice each
licence requires. Fonts and npm packages carry their own licences in
`node_modules`; this file is for material copied into our own source.

## 8B — design studio website template (MIT)

- Source: https://github.com/8bsite/design-studio-website-template
  (https://8b.com/templates/onda/)
- What we took (28 Oct 2026): the palette (near-black `#0d0c11`, white,
  violet `#6c3cff`, pale card `#efeef4`, muted inks `#5d5a67` / `#aaa7b4`,
  dark base `#1f1d26`) as tokens in `src/styles/tokens.css`; its shapes
  (soft card radius, pill primary action, generous padding, tight heading
  tracking) in `src/styles/skins/studio.css` and `src/styles/kit.css`; and
  the metric-matched "Gabarito Fallback" / "Onest Fallback" `@font-face`
  rules, copied into `src/styles/fonts.css`. Each file says so in a header
  comment where the material is used.
- Not taken: the template's photographs (Unsplash; we use only our own
  product screenshots and videos), its GSAP / Lenis scripts and every CDN
  reference (our CSP is same-origin), and its copy.

```
MIT License

Copyright (c) 2026 8B (https://8b.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Cruip (GPL-3.0) — inspiration only

Layouts from Cruip's templates were looked at for page structure. No code,
markup or class list was copied from them, so no GPL obligation attaches.
