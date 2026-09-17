# Crossword uploader

The homepage links to `/crossword-upload/`. This static owner page publishes self-contained UTF-8 HTML to `narasimharaokvn-dev/KVN-Telugu-Crossword`, branch `main`. By default it also converts the old export for the newer app: embedded raster image, saved row/column boundaries, numbered cells and Telugu clues. It parses JSON literals without executing the uploaded JavaScript. Existing GitHub Pages hosting serves both versions at `https://crossword.kvnrao.com`.

Use YYMMDD.html or YY-MM-DD.html. Folder mapping: 1EEEXPORTED → EE, 2AJEXPORTED → AJ, 3SAEXPORTED → SA, 5HEXPORTED → HI. Conversion copies saved data; it does not infer missing clues or correct bad grid alignment. Disable conversion to upload standalone HTML only.

GitHub's Git Data API saves the HTML, extracted image, grid/clue JSON and magazine catalogue in one non-force commit. Marking latest also updates `latest.html` and `DYNAMIC/sources.json` with an explicit `latestPuzzle` selection. The crossword app honors that selection, with its existing numeric fallback for older catalogues. App links include folder and puzzle query parameters and open the specified puzzle directly. The upload result offers Copy app link and Copy HTML link.

The owner enters a fine-grained GitHub personal access token scoped only to that repository with Contents read/write. The password field clears at submission and the token is never persisted in cookies or browser storage. Uploaded HTML is never previewed or executed by the uploader. Keep the uploader on `kvnrao.com`, separate from the uploaded HTML origin `crossword.kvnrao.com`; do not copy the uploader into the crossword repository.

Existing HTML or converted files require explicit replacement, including existing manual grid/clue corrections. Other catalogue entries, solution references and metadata are retained. Concurrent edits are protected by a non-force branch update. Publication checks every generated text file and the exact image bytes before enabling either copy button. A pending deployment or failed verification is never reported as live.

Pages must already deploy `main` from the repository root. This page does not change hosting, DNS or permissions. First-time help explains key setup. Never save an upload key in the repository. After web uploads, local crossword checkouts should pull before editing or pushing.

Run `node --test tests/*.test.mjs` from the homepage repository. Tests mock GitHub requests to cover Unicode, parsing, conversion, atomic commits, correction preservation, validation, authentication, concurrency, uncertain responses and verification of all live assets. The real September 13 export was also checked against its existing app image, grid and clue files; all matched exactly. An authenticated production upload requires the owner's key.
