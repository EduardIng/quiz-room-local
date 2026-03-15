# Media / Image Integrity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make image attachments in QuizCreator persist reliably to the quiz JSON, prevent duplicate uploads, garbage-collect orphan media files, surface missing-image warnings to the host, and add a media picker so previously-uploaded files can be reused.

**Architecture:** Backend gains upsert-save, a media list endpoint, hash-based dedup on upload, an orphan-cleanup endpoint, and missing-image flags in the quiz list response. Frontend gains quiz-ID tracking (so saves overwrite the correct file), auto-save after image upload, a media picker modal, and a warning badge in HostView. `first-try.json` gets its broken placeholder image references stripped.

**Tech Stack:** Node.js / Express / multer (backend), React + hooks (frontend), Jest + supertest (tests), `crypto` built-in for MD5 hashing.

---

## Chunk 1: Backend — upsert save + media infrastructure

### Task 1: Upsert save in quiz-storage.js

**Files:**
- Modify: `backend/src/quiz-storage.js`
- Modify: `backend/tests/quiz-storage.test.js`

- [ ] **Step 1: Write failing tests for upsert behaviour**

Add to `backend/tests/quiz-storage.test.js`:

```js
describe('saveQuiz — upsert', () => {
  it('overwrites existing file when id matches', () => {
    const q1 = { title: 'Upsert Quiz', categoryMode: true, rounds: [{ options: [
      { category: 'A', question: 'Q?', answers: ['a','b','c','d'], correctAnswer: 0 },
      { category: 'B', question: 'Q2?', answers: ['a','b','c','d'], correctAnswer: 1 }
    ]}]};
    const r1 = saveQuiz(q1);
    // Now save again with same id — should overwrite, not create -2
    const q2 = { ...q1, title: 'Upsert Quiz Updated', id: r1.id };
    const r2 = saveQuiz(q2);
    expect(r2.id).toBe(r1.id);
    expect(r2.filename).toBe(r1.filename);
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json'));
    expect(files).toHaveLength(1);
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, r2.filename), 'utf8'));
    expect(saved.title).toBe('Upsert Quiz Updated');
  });

  it('creates new file when id not provided', () => {
    const q = { title: 'No ID Quiz', categoryMode: true, rounds: [{ options: [
      { category: 'A', question: 'Q?', answers: ['a','b','c','d'], correctAnswer: 0 },
      { category: 'B', question: 'Q2?', answers: ['a','b','c','d'], correctAnswer: 1 }
    ]}]};
    const r1 = saveQuiz(q);
    const r2 = saveQuiz(q); // no id — should make second file
    expect(r2.id).not.toBe(r1.id);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd /Users/einhorn/quiz-room-local && npx jest quiz-storage --no-coverage 2>&1 | tail -20
```
Expected: FAIL — overwrite test shows two files instead of one.

- [ ] **Step 3: Implement upsert in saveQuiz**

In `backend/src/quiz-storage.js`, replace the filename-generation block (lines 181–191) with:

```js
  // Якщо переданий id і відповідний файл існує — перезаписуємо (upsert)
  let filename, id;
  if (quizData.id) {
    const candidateName = `${path.basename(quizData.id)}.json`;
    if (fs.existsSync(path.join(QUIZZES_DIR, candidateName))) {
      filename = candidateName;
      id = quizData.id;
    }
  }

  // Якщо id не переданий або файл не існує — генеруємо нову назву
  if (!filename) {
    const baseName = titleToFilename(quizData.title);
    filename = `${baseName}.json`;
    let counter = 2;
    while (fs.existsSync(path.join(QUIZZES_DIR, filename))) {
      filename = `${baseName}-${counter}.json`;
      counter++;
    }
    id = filename.replace('.json', '');
  }
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd /Users/einhorn/quiz-room-local && npx jest quiz-storage --no-coverage 2>&1 | tail -20
```
Expected: all quiz-storage tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/einhorn/quiz-room-local
git add backend/src/quiz-storage.js backend/tests/quiz-storage.test.js
git commit -m "feat: upsert save — overwrite existing quiz file when id provided"
```

---

### Task 2: `listReferencedMedia` helper + media list endpoint

**Files:**
- Modify: `backend/src/quiz-storage.js`
- Modify: `backend/src/server.js`
- Modify: `backend/tests/server.test.js`

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/server.test.js`:

```js
describe('GET /api/media', () => {
  it('returns file list', async () => {
    // Потрібна тимчасова media директорія — server.test.js вже має tmpMediaDir env var
    const res = await request(app).get('/api/media');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('files');
    expect(Array.isArray(res.body.files)).toBe(true);
  });
});
```

Also, in `beforeAll`, add a temp media dir env var alongside the existing ones:

```js
const tmpMediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-media-'));
process.env.TEST_MEDIA_DIR = tmpMediaDir;
```

And in `afterAll`:

```js
fs.rmSync(tmpMediaDir, { recursive: true, force: true });
delete process.env.TEST_MEDIA_DIR;
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd /Users/einhorn/quiz-room-local && npx jest server --no-coverage 2>&1 | tail -20
```
Expected: FAIL — GET /api/media not found (404).

- [ ] **Step 3: Add `listReferencedMedia` to quiz-storage.js**

Add after `loadAllQuizzes`:

```js
/**
 * Повертає Set усіх filename, на які посилаються квізи (поле image у питаннях)
 * Використовується для пошуку сиріт у media/
 *
 * @returns {Set<string>}
 */
function listReferencedMedia() {
  const refs = new Set();
  if (!fs.existsSync(QUIZZES_DIR)) return refs;
  const files = fs.readdirSync(QUIZZES_DIR).filter(f => f.endsWith('.json') && f !== 'README.json');
  for (const filename of files) {
    try {
      const quiz = JSON.parse(fs.readFileSync(path.join(QUIZZES_DIR, filename), 'utf8'));
      const rounds = quiz.rounds || [];
      for (const round of rounds) {
        for (const opt of (round.options || [])) {
          if (opt.image) refs.add(opt.image);
          if (opt.audio) refs.add(opt.audio);
        }
      }
    } catch (_) {}
  }
  return refs;
}
```

Add `listReferencedMedia` to the module exports.

- [ ] **Step 4: Add `GET /api/media` to server.js**

In `setupRoutes()`, after the existing `GET /api/media/:filename` handler, add:

```js
    // API: список медіафайлів у папці media/
    this.app.get('/api/media', (_req, res) => {
      try {
        if (!fs.existsSync(mediaPath)) return res.json({ files: [] });
        const files = fs.readdirSync(mediaPath)
          .filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f))
          .map(f => ({
            filename: f,
            url: `/api/media/${f}`,
            size: fs.statSync(path.join(mediaPath, f)).size
          }));
        res.json({ files });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
```

Note: `fs` must be imported at the top of server.js. Check that `const fs = require('fs');` is present; add it if missing.

- [ ] **Step 5: Run tests to confirm pass**

```bash
cd /Users/einhorn/quiz-room-local && npx jest server --no-coverage 2>&1 | tail -20
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/einhorn/quiz-room-local
git add backend/src/quiz-storage.js backend/src/server.js backend/tests/server.test.js
git commit -m "feat: add listReferencedMedia helper and GET /api/media endpoint"
```

---

### Task 3: Upload deduplication (hash-based)

**Files:**
- Modify: `backend/src/server.js`
- Modify: `backend/tests/server.test.js`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/server.test.js`:

```js
describe('POST /api/media/upload — deduplication', () => {
  it('returns same filename when uploading identical file twice', async () => {
    const buf = Buffer.from('fake-image-data-abc');
    const res1 = await request(app)
      .post('/api/media/upload')
      .attach('image', buf, { filename: 'test.png', contentType: 'image/png' });
    expect(res1.body.success).toBe(true);

    const res2 = await request(app)
      .post('/api/media/upload')
      .attach('image', buf, { filename: 'test.png', contentType: 'image/png' });
    expect(res2.body.success).toBe(true);
    expect(res2.body.filename).toBe(res1.body.filename);

    // Перевіряємо що файл один
    const files = fs.readdirSync(process.env.TEST_MEDIA_DIR).filter(f => f.endsWith('.png'));
    expect(files).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd /Users/einhorn/quiz-room-local && npx jest server --no-coverage -t "deduplication" 2>&1 | tail -20
```
Expected: FAIL — two files created.

- [ ] **Step 3: Add hash dedup to upload handler**

At the top of server.js, ensure `const crypto = require('crypto');` is present.

Replace the upload handler body (the part after `upload.single('image')(req, res, ...)`) with:

```js
    this.app.post('/api/media/upload', (req, res) => {
      upload.single('image')(req, res, (err) => {
        if (err) {
          return res.status(400).json({ success: false, error: err.message });
        }
        if (!req.file) {
          return res.status(400).json({ success: false, error: 'Файл не отримано' });
        }

        // Обчислюємо MD5 нового файлу
        const newFilePath = req.file.path;
        const newHash = crypto.createHash('md5').update(fs.readFileSync(newFilePath)).digest('hex');

        // Шукаємо дублікат серед існуючих файлів
        let duplicate = null;
        if (fs.existsSync(uploadMediaDir)) {
          for (const existing of fs.readdirSync(uploadMediaDir)) {
            if (existing === req.file.filename) continue; // сам файл
            const existingPath = path.join(uploadMediaDir, existing);
            try {
              const existingHash = crypto.createHash('md5').update(fs.readFileSync(existingPath)).digest('hex');
              if (existingHash === newHash) { duplicate = existing; break; }
            } catch (_) {}
          }
        }

        if (duplicate) {
          // Видаляємо щойно завантажений і повертаємо існуючий
          fs.unlinkSync(newFilePath);
          return res.json({ success: true, filename: duplicate, url: `/api/media/${duplicate}` });
        }

        const filename = path.basename(req.file.filename);
        res.json({ success: true, filename, url: `/api/media/${filename}` });
      });
    });
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/einhorn/quiz-room-local && npx jest server --no-coverage 2>&1 | tail -20
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/einhorn/quiz-room-local
git add backend/src/server.js backend/tests/server.test.js
git commit -m "feat: hash-based deduplication on media upload — reuse existing file if identical"
```

---

### Task 4: Orphan cleanup endpoint

**Files:**
- Modify: `backend/src/server.js`
- Modify: `backend/tests/server.test.js`

- [ ] **Step 1: Write failing test**

```js
describe('DELETE /api/media/orphans', () => {
  it('deletes unreferenced media files', async () => {
    // Створюємо файл у media dir, який не згадується в жодному квізі
    const orphanPath = path.join(process.env.TEST_MEDIA_DIR, 'orphan.png');
    fs.writeFileSync(orphanPath, 'fake-orphan');

    const res = await request(app).delete('/api/media/orphans');
    expect(res.status).toBe(200);
    expect(res.body.deleted).toContain('orphan.png');
    expect(fs.existsSync(orphanPath)).toBe(false);
  });

  it('keeps referenced media files', async () => {
    // Зберігаємо квіз з image референцем
    const keepFile = 'keep-me.png';
    fs.writeFileSync(path.join(process.env.TEST_MEDIA_DIR, keepFile), 'fake-keep');
    await request(app)
      .post('/api/quizzes/save')
      .send({
        title: 'Orphan Test Quiz',
        categoryMode: true,
        rounds: [{ options: [
          { category: 'A', question: 'Q?', answers: ['a','b','c','d'], correctAnswer: 0, image: keepFile },
          { category: 'B', question: 'Q2?', answers: ['a','b','c','d'], correctAnswer: 1 }
        ]}]
      });

    const res = await request(app).delete('/api/media/orphans');
    expect(res.body.deleted).not.toContain(keepFile);
    expect(fs.existsSync(path.join(process.env.TEST_MEDIA_DIR, keepFile))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd /Users/einhorn/quiz-room-local && npx jest server --no-coverage -t "orphans" 2>&1 | tail -20
```
Expected: FAIL — 404.

- [ ] **Step 3: Add DELETE /api/media/orphans to server.js**

```js
    // API: видалення медіафайлів, на які не посилається жоден квіз
    this.app.delete('/api/media/orphans', (_req, res) => {
      try {
        if (!fs.existsSync(mediaPath)) return res.json({ deleted: [] });
        const refs = listReferencedMedia();
        const deleted = [];
        for (const file of fs.readdirSync(mediaPath)) {
          if (/\.(jpe?g|png|gif|webp)$/i.test(file) && !refs.has(file)) {
            fs.unlinkSync(path.join(mediaPath, file));
            deleted.push(file);
          }
        }
        res.json({ success: true, deleted });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
```

Also add `listReferencedMedia` to the destructured import at the top of server.js:
```js
const { loadAllQuizzes, saveQuiz, deleteQuiz, listReferencedMedia } = require('./quiz-storage');
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/einhorn/quiz-room-local && npx jest server --no-coverage 2>&1 | tail -20
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/einhorn/quiz-room-local
git add backend/src/server.js backend/tests/server.test.js
git commit -m "feat: DELETE /api/media/orphans — remove media files unreferenced by any quiz"
```

---

### Task 5: Missing-image flags in GET /api/quizzes

**Files:**
- Modify: `backend/src/server.js`
- Modify: `backend/tests/server.test.js`

The goal: each quiz object in the `/api/quizzes` response gains a `missingImages: string[]` field listing any `image` filenames that do not exist in `media/`.

- [ ] **Step 1: Write failing test**

```js
describe('GET /api/quizzes — missingImages', () => {
  it('flags missing image files', async () => {
    // Зберігаємо квіз з неіснуючим зображенням
    await request(app)
      .post('/api/quizzes/save')
      .send({
        title: 'Missing Image Quiz',
        categoryMode: true,
        rounds: [{ options: [
          { category: 'A', question: 'Q?', answers: ['a','b','c','d'], correctAnswer: 0, image: 'nonexistent.jpg' },
          { category: 'B', question: 'Q2?', answers: ['a','b','c','d'], correctAnswer: 1 }
        ]}]
      });

    const res = await request(app).get('/api/quizzes');
    const quiz = res.body.quizzes.find(q => q.title === 'Missing Image Quiz');
    expect(quiz).toBeDefined();
    expect(quiz.missingImages).toContain('nonexistent.jpg');
  });

  it('no missingImages when all referenced files exist', async () => {
    const imgFile = 'existing.png';
    fs.writeFileSync(path.join(process.env.TEST_MEDIA_DIR, imgFile), 'fake');
    await request(app)
      .post('/api/quizzes/save')
      .send({
        title: 'Good Image Quiz',
        categoryMode: true,
        rounds: [{ options: [
          { category: 'A', question: 'Q?', answers: ['a','b','c','d'], correctAnswer: 0, image: imgFile },
          { category: 'B', question: 'Q2?', answers: ['a','b','c','d'], correctAnswer: 1 }
        ]}]
      });

    const res = await request(app).get('/api/quizzes');
    const quiz = res.body.quizzes.find(q => q.title === 'Good Image Quiz');
    expect(quiz.missingImages).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd /Users/einhorn/quiz-room-local && npx jest server --no-coverage -t "missingImages" 2>&1 | tail -20
```
Expected: FAIL — `missingImages` is undefined.

- [ ] **Step 3: Add missingImages to GET /api/quizzes response**

Find the `GET /api/quizzes` handler in server.js. It currently returns `{ quizzes: data }`. Change it to annotate each quiz:

```js
    this.app.get('/api/quizzes', (_req, res) => {
      const quizzes = loadAllQuizzes();
      // Додаємо список відсутніх зображень для кожного квізу
      const annotated = quizzes.map(quiz => {
        const missingImages = [];
        for (const round of (quiz.rounds || [])) {
          for (const opt of (round.options || [])) {
            if (opt.image && !fs.existsSync(path.join(mediaPath, opt.image))) {
              if (!missingImages.includes(opt.image)) missingImages.push(opt.image);
            }
          }
        }
        return { ...quiz, missingImages };
      });
      res.json({ success: true, quizzes: annotated });
    });
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/einhorn/quiz-room-local && npx jest server --no-coverage 2>&1 | tail -20
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/einhorn/quiz-room-local
git add backend/src/server.js backend/tests/server.test.js
git commit -m "feat: annotate quiz list with missingImages array for host validation"
```

---

## Chunk 2: Frontend — quiz ID tracking, auto-save, host warning

### Task 6: Track currentQuizId in QuizCreator + use upsert on save

**Files:**
- Modify: `frontend/src/components/QuizCreator.jsx`

- [ ] **Step 1: Add `currentQuizId` state**

In the state declarations block (around line 55), add:

```js
  // ID квізу що зараз редагується (null = новий квіз)
  const [currentQuizId, setCurrentQuizId] = useState(null);
```

- [ ] **Step 2: Set ID when loading from library**

In `handleSelectLibraryQuiz` (around line 575), after `setTitle(quiz.title)`, add:

```js
    setCurrentQuizId(quiz.id || null);
```

- [ ] **Step 3: Clear ID when starting a new quiz**

Find the "New quiz / clear" action (wherever `setTitle('')` and `setRounds(...)` are called to reset the editor). Add `setCurrentQuizId(null);` there.

If there is no explicit "New quiz" button (check the render section), add it alongside the reset. Look for any "reset" or "new" handler in QuizCreator.jsx — if none exists, add `setCurrentQuizId(null)` next to `setTitle` in the import handler (`handleImportJSON` around line 450).

- [ ] **Step 4: Include id in save payload**

In `handleSaveToLibrary` (around line 508), update the `quizData` object:

```js
    const quizData = {
      ...(currentQuizId ? { id: currentQuizId } : {}),  // <-- add this line
      title: title.trim() || 'Мій квіз',
      categoryMode: true,
      rounds: rounds.map(r => ({ /* existing mapping */ }))
    };
```

- [ ] **Step 5: Update currentQuizId from save response**

In `handleSaveToLibrary`, after `if (data.success)`, add:

```js
        setCurrentQuizId(data.id);
```

- [ ] **Step 6: Manual smoke test**

```
1. npm start
2. cd frontend && npm run dev
3. Open http://localhost:3000/#/create
4. Load "First try" from library
5. Change the title slightly → Save to library
6. Check quizzes/first-try.json — title should be updated in the SAME file (not a new first-try-2.json)
```

- [ ] **Step 7: Commit**

```bash
cd /Users/einhorn/quiz-room-local
git add frontend/src/components/QuizCreator.jsx
git commit -m "feat: track currentQuizId in editor — saves overwrite existing quiz instead of creating duplicates"
```

---

### Task 7: Auto-save after image upload

**Files:**
- Modify: `frontend/src/components/QuizCreator.jsx`

The challenge: React state updates are asynchronous, so calling `handleSaveToLibrary` immediately after `updateRoundOption` would use the OLD `rounds` value. Solution: compute the updated rounds inline and pass them directly to a extracted save helper.

- [ ] **Step 1: Extract `doSaveToLibrary(overrideRounds)` helper**

Before `handleSaveToLibrary`, add:

```js
  // Базова логіка збереження — приймає rounds явно щоб не залежати від стану
  const doSaveToLibrary = useCallback(async (roundsToSave, { silent = false } = {}) => {
    const quizData = {
      ...(currentQuizId ? { id: currentQuizId } : {}),
      title: title.trim() || 'Мій квіз',
      categoryMode: true,
      rounds: roundsToSave.map(r => ({
        options: r.options.map(opt => ({
          category: opt.category.trim(),
          question: opt.question.trim(),
          answers: opt.answers.map(a => a.trim()),
          correctAnswer: opt.correctAnswer,
          ...(opt.timeLimit ? { timeLimit: parseInt(opt.timeLimit, 10) } : {}),
          ...(opt.image?.trim() ? { image: opt.image.trim() } : {}),
          ...(opt.audio?.trim() ? { audio: opt.audio.trim() } : {})
        }))
      }))
    };
    if (!quizData.title || !quizData.rounds.length) return;
    try {
      const res = await fetch('/api/quizzes/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quizData)
      });
      const data = await res.json();
      if (data.success) {
        setCurrentQuizId(data.id);
        if (!silent) {
          setSaveSuccess(`✓ Збережено: "${quizData.title}"`);
          setShowHostLink(true);
          if (showLibrary) {
            const libRes = await fetch('/api/quizzes');
            const libData = await libRes.json();
            setLibraryQuizzes(libData.quizzes || []);
          }
          setTimeout(() => { setSaveSuccess(''); setShowHostLink(false); }, 5000);
        }
      } else if (!silent) {
        setImportError(data.error || 'Could not save quiz');
      }
    } catch {
      if (!silent) setImportError('Could not save quiz to library');
    }
  }, [currentQuizId, title, showLibrary]);
```

- [ ] **Step 2: Simplify `handleSaveToLibrary` to call the helper**

Replace the body of `handleSaveToLibrary` with:

```js
  const handleSaveToLibrary = useCallback(async () => {
    setImportError('');
    setSaveSuccess('');
    const repeatError = getCategoryRepeatError(rounds);
    if (repeatError) { setImportError(repeatError); return; }
    await doSaveToLibrary(rounds);
  }, [rounds, doSaveToLibrary]);
```

- [ ] **Step 3: Auto-save in handleImageUpload**

In `handleImageUpload`, after `updateRoundOption(roundIdx, optIdx, 'image', data.filename)`, add:

```js
        // Будуємо новий rounds inline (без затримки стану) і зберігаємо тихо
        const updatedRounds = rounds.map((r, ri) => {
          if (ri !== roundIdx) return r;
          return {
            ...r,
            options: r.options.map((opt, oi) =>
              oi === optIdx ? { ...opt, image: data.filename } : opt
            )
          };
        });
        await doSaveToLibrary(updatedRounds, { silent: true });
```

- [ ] **Step 4: Smoke test**

```
1. Open editor, load "First try" from library
2. Attach a new image to Round 1, Option 1
3. Without clicking Save, check quizzes/first-try.json
4. Expected: image field updated to new timestamp filename
5. Start quiz from HostView — image should appear
```

- [ ] **Step 5: Commit**

```bash
cd /Users/einhorn/quiz-room-local
git add frontend/src/components/QuizCreator.jsx
git commit -m "feat: auto-save quiz after image upload — JSON stays in sync without manual save"
```

---

### Task 8: Missing-image warning badge in HostView

**Files:**
- Modify: `frontend/src/components/HostView.jsx`

The `/api/quizzes` response now includes `missingImages: []` per quiz (from Task 5). HostView just needs to display a warning badge when `quiz.missingImages.length > 0`.

- [ ] **Step 1: Add warning badge to quiz list item**

Find the `quizzes.map(quiz => ...)` render block (around line 419 in HostView.jsx). Inside the quiz list item, after the title, add:

```jsx
              {quiz.missingImages?.length > 0 && (
                <span
                  className="quiz-missing-media-badge"
                  title={`Missing images: ${quiz.missingImages.join(', ')}`}
                >
                  ⚠️ {quiz.missingImages.length} missing image{quiz.missingImages.length > 1 ? 's' : ''}
                </span>
              )}
```

- [ ] **Step 2: Add CSS for the badge**

Find `frontend/src/components/HostView.css` (or the relevant CSS file for HostView). Add:

```css
.quiz-missing-media-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  background: #f59e0b;
  color: #1a1a1a;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  vertical-align: middle;
  cursor: help;
}
```

- [ ] **Step 3: Smoke test**

```
1. Ensure first-try.json has an image reference to a file that doesn't exist in media/
2. Open HostView — quiz should show ⚠️ badge
3. Hover badge — tooltip lists the missing filename(s)
```

- [ ] **Step 4: Commit**

```bash
cd /Users/einhorn/quiz-room-local
git add frontend/src/components/HostView.jsx frontend/src/components/HostView.css
git commit -m "feat: warn host when selected quiz references missing media files"
```

---

## Chunk 3: Media picker UI in QuizCreator

### Task 9: Media picker modal

**Files:**
- Modify: `frontend/src/components/QuizCreator.jsx`
- Modify: `frontend/src/components/QuizCreator.css`

The image field currently shows either a preview (if image set) or an upload button. We add a second button "Pick existing" that opens a modal showing thumbnails of all files already in `media/`. Clicking a thumbnail sets the image field and closes the modal — no upload needed.

- [ ] **Step 1: Add media picker state**

In the state block, add:

```js
  // { roundIdx, optIdx } коли відкрито пікер, null коли закрито
  const [mediaPicker, setMediaPicker] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]);  // кеш файлів з /api/media
```

- [ ] **Step 2: Add openMediaPicker handler**

```js
  const openMediaPicker = useCallback(async (roundIdx, optIdx) => {
    try {
      const res = await fetch('/api/media');
      const data = await res.json();
      setMediaFiles(data.files || []);
      setMediaPicker({ roundIdx, optIdx });
    } catch {
      setImportError('Could not load media library');
    }
  }, []);

  const closeMediaPicker = useCallback(() => setMediaPicker(null), []);

  const pickMediaFile = useCallback((filename) => {
    if (!mediaPicker) return;
    const { roundIdx, optIdx } = mediaPicker;
    updateRoundOption(roundIdx, optIdx, 'image', filename);
    // Авто-зберігаємо з новим зображенням
    const updatedRounds = rounds.map((r, ri) => {
      if (ri !== roundIdx) return r;
      return { ...r, options: r.options.map((opt, oi) =>
        oi === optIdx ? { ...opt, image: filename } : opt
      )};
    });
    doSaveToLibrary(updatedRounds, { silent: true });
    setMediaPicker(null);
  }, [mediaPicker, rounds, updateRoundOption, doSaveToLibrary]);
```

- [ ] **Step 3: Add "Pick existing" button next to upload button**

In the image field render block (around line 888), add a second button alongside the upload label:

```jsx
                        <div className="image-upload-group">
                          <label className={`image-upload-btn${uploadingImage?.roundIdx === activeRound && uploadingImage?.optIdx === optIdx ? ' uploading' : ''}`}>
                            {uploadingImage?.roundIdx === activeRound && uploadingImage?.optIdx === optIdx
                              ? (lang === 'uk' ? 'Завантаження...' : 'Uploading...')
                              : (lang === 'uk' ? '📎 Завантажити нове' : '📎 Upload new')}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/gif,image/webp"
                              style={{ display: 'none' }}
                              onChange={e => handleImageUpload(e, activeRound, optIdx)}
                              disabled={!!uploadingImage}
                            />
                          </label>
                          <button
                            type="button"
                            className="image-pick-btn"
                            onClick={() => openMediaPicker(activeRound, optIdx)}
                          >
                            {lang === 'uk' ? '🖼 З бібліотеки' : '🖼 From library'}
                          </button>
                        </div>
```

- [ ] **Step 4: Add the picker modal**

At the bottom of the QuizCreator JSX (before the closing `</div>` of the outermost element), add:

```jsx
      {mediaPicker && (
        <div className="media-picker-overlay" onClick={closeMediaPicker}>
          <div className="media-picker-modal" onClick={e => e.stopPropagation()}>
            <div className="media-picker-header">
              <span>{lang === 'uk' ? 'Оберіть зображення' : 'Pick an image'}</span>
              <button className="media-picker-close" onClick={closeMediaPicker}>✕</button>
            </div>
            {mediaFiles.length === 0 ? (
              <p className="media-picker-empty">
                {lang === 'uk' ? 'Бібліотека медіа порожня' : 'Media library is empty'}
              </p>
            ) : (
              <div className="media-picker-grid">
                {mediaFiles.map(f => (
                  <button
                    key={f.filename}
                    className="media-picker-thumb"
                    onClick={() => pickMediaFile(f.filename)}
                    title={f.filename}
                  >
                    <img src={f.url} alt={f.filename} onError={e => { e.target.style.display='none'; }} />
                    <span className="media-picker-name">{f.filename}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 5: Add CSS for modal**

In `frontend/src/components/QuizCreator.css`, add:

```css
.image-upload-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.image-pick-btn {
  padding: 8px 14px;
  background: var(--color-surface, #2a2a2a);
  border: 1px dashed #666;
  border-radius: 6px;
  color: #ccc;
  cursor: pointer;
  font-size: 0.85rem;
}
.image-pick-btn:hover { border-color: #aaa; color: #fff; }

.media-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-picker-modal {
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 10px;
  width: 640px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.media-picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #333;
  font-weight: 600;
}

.media-picker-close {
  background: none;
  border: none;
  color: #999;
  font-size: 1.2rem;
  cursor: pointer;
}
.media-picker-close:hover { color: #fff; }

.media-picker-empty {
  padding: 24px;
  text-align: center;
  color: #888;
}

.media-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  padding: 16px;
  overflow-y: auto;
}

.media-picker-thumb {
  background: #2a2a2a;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  padding: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: border-color 0.15s;
}
.media-picker-thumb:hover { border-color: #4a90e2; }
.media-picker-thumb img {
  width: 100%;
  height: 90px;
  object-fit: contain;
}
.media-picker-name {
  font-size: 0.65rem;
  color: #999;
  word-break: break-all;
  text-align: center;
}
```

- [ ] **Step 6: Smoke test**

```
1. Open creator → load any quiz
2. Round 1 → image field → click "From library"
3. Modal should open with thumbnails of files in media/
4. Click a thumbnail → image set, modal closes, auto-save fires
5. Reload the quiz from library → image should still be set
```

- [ ] **Step 7: Commit**

```bash
cd /Users/einhorn/quiz-room-local
git add frontend/src/components/QuizCreator.jsx frontend/src/components/QuizCreator.css
git commit -m "feat: media picker modal — reuse existing images from library without re-uploading"
```

---

## Chunk 4: Data fix

### Task 10: Strip broken image references from first-try.json

`first-try.json` currently references images like `logo_apple.jpg`, `this_is_fine.jpg`, etc. — none of which exist in `media/`. Because we now show a host warning, these will show ⚠️ until the images are re-attached. The cleanest fix is to remove the dangling references so the quiz is playable without warnings, and let the host re-attach real images via the picker.

- [ ] **Step 1: Remove all `image` fields from first-try.json**

Edit `quizzes/first-try.json`. For every question object that has an `"image"` key, remove that key entirely. The affected questions are those in the "Логотипи і бренди" and "Інтернет-культура і меми" categories.

Filenames to remove (search and delete the `"image": "..."` line in each):
- `logo_apple.jpg`
- `this_is_fine.jpg`
- `logo_starbucks.jpg`
- `distracted_boyfriend.jpg`
- `drake_hotline_bling.jpg`
- `logo_spotify.jpg`
- `woman_yelling_at_cat.jpg`
- `logo_airbnb.jpg`
- `logo_tesla.jpg`
- `surprised_pikachu.jpg`
- `hide_the_pain_harold.jpg`
- `is_this_a_pigeon.jpg`
- `logo_firefox.jpg`
- `logo_lacoste.jpg`
- `roll_safe.jpg`
- `logo_nasa.jpg`
- `logo_tiktok.jpg`
- `change_my_mind.jpg`
- `logo_mastercard.jpg`
- `expanding_brain.jpg`

- [ ] **Step 2: Validate the JSON is still valid**

```bash
cd /Users/einhorn/quiz-room-local && node -e "JSON.parse(require('fs').readFileSync('quizzes/first-try.json','utf8')); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 3: Confirm no ⚠️ badge in HostView**

```
1. npm start
2. Open HostView
3. "First try" should have no warning badge
```

- [ ] **Step 4: Commit**

```bash
cd /Users/einhorn/quiz-room-local
git add quizzes/first-try.json
git commit -m "fix: remove broken placeholder image references from first-try.json"
```

---

## Final verification

- [ ] Run full test suite: `npm test` — all pass
- [ ] End-to-end smoke: open HostView, create room with "First try", verify no ⚠️, start game, verify questions display correctly
- [ ] Upload the same image twice in QuizCreator — confirm only one file in `media/` after second upload
- [ ] Attach image, do NOT click Save, reload HostView — confirm image shows in quiz
- [ ] Open media picker — confirm previously uploaded thumbnails appear
