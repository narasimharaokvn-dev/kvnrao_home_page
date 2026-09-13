# Crossword uploader

The homepage links to `/crossword-upload/`. This static owner page publishes self-contained UTF-8 HTML to `narasimharaokvn-dev/KVN-Telugu-Crossword`, branch `main`. GitHub's Git Data API saves the puzzle and optional `latest.html` redirect in one commit. Existing GitHub Pages hosting serves puzzles at `https://crossword.kvnrao.com`.

The owner enters a fine-grained GitHub personal access token scoped only to that repository with Contents read/write. The password field clears at submission and the token is never persisted in cookies or browser storage. Uploaded HTML is never previewed or executed by the uploader. Keep the uploader on `kvnrao.com`, separate from the uploaded HTML origin `crossword.kvnrao.com`; do not copy the uploader into the crossword repository.

Existing filenames require explicit replacement. Concurrent edits are protected by a non-force branch update. Publication is checked against the live HTML before Copy link is enabled. A pending deployment or failed verification is never reported as live.

Pages must already deploy `main` from the repository root. This page does not change hosting, DNS or permissions. First-time help explains key setup. Never save an upload key in the repository. After web uploads, local crossword checkouts should pull before editing or pushing.

Run `node --test tests/publisher.test.mjs` from the homepage repository. Tests mock GitHub requests to cover Unicode, atomic commits, overwrites, validation, authentication, concurrency, uncertain responses and live verification. An authenticated production upload requires the owner's key.
