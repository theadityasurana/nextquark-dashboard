# Third-Party Notices

This project incorporates source code from the third-party projects listed below.
Each entry reproduces the license under which that code is redistributed, as those
licenses require.

---

## tsenta

**Source:** https://github.com/jaethebaeee/tsenta
**License:** MIT
**Copyright:** Copyright (c) 2026 Jae Hoon Kim

**Incorporated into this project:**

- `lib/kernel.ts` — the dropdown option resolver (`US_STATES`, `SYNONYM_GROUPS`,
  `normalizeOption`, `synonymsOf`, `matchOption`, `searchTerms`), ported from that
  project's `src/server/workday-select.ts`.

```
MIT License

Copyright (c) 2026 Jae Hoon Kim

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

---

## Adding to this file

If you port code from another project, add an entry here **at the time you port
it**, with the source URL, the license name, the copyright line, and the full
license text. Note in the entry which files in this repo contain the ported code,
and leave a provenance comment at the port site pointing back here.
