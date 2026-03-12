# Require categoryMode on All Quizzes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject any `create-quiz` event that does not carry `categoryMode: true` — standard quizzes are no longer supported.

**Architecture:** Add a top-level guard in `handleCreateQuiz` (before the existing `if (data.quizData.categoryMode)` branch) that returns an error if `categoryMode` is falsy or `rounds` is missing/not an array. Then delete the `else` branch that handles standard quizzes. Update existing tests that use `QUIZ_DATA` (standard fixture) to use a category-mode fixture, and add one new failing-then-passing test.

**Tech Stack:** Node.js / Socket.IO / Jest

---

### Task 1: Add failing test

**Files:**
- Modify: `backend/tests/websocket.test.js`

- [x] **Step 1.1: Add the new test inside the `handleCreateQuiz` describe block**

Add after the last existing test in `QuizRoomManager — handleCreateQuiz` (after line 234 in current file):

```js
it('rejects create-quiz when quizData does not have categoryMode: true', (done) => {
  const { mockIo } = createMocks();
  const manager = new QuizRoomManager(mockIo, DEFAULT_CONFIG);
  const socket = { id: 's1', join: jest.fn() };
  const standardQuiz = { title: 'Test', questions: [
    { question: 'Q1', answers: ['A','B','C','D'], correctAnswer: 0 }
  ]};
  manager.handleCreateQuiz(socket, { quizData: standardQuiz, settings: {} }, (response) => {
    expect(response.success).toBe(false);
    expect(response.error).toMatch(/category mode/i);
    done();
  });
});
```

- [x] **Step 1.2: Run test to confirm it fails**

```bash
cd /Users/einhorn/quiz-room-local && npm test -- --testPathPattern=websocket --verbose 2>&1 | tail -30
```
Expected: FAIL — standard quiz currently passes through.

---

### Task 2: Update QUIZ_DATA fixture and dependent tests

**Files:**
- Modify: `backend/tests/websocket.test.js`

**Context:** `QUIZ_DATA` (the top-level fixture) is used by `setupRoomWithQuiz` which is used by almost every test in the file. Once the `else` branch is removed, standard quizzes will be rejected and all those tests will break. Solution: replace `QUIZ_DATA` with a minimal category-mode fixture, and update any tests that assert on `title` or internal quiz data.

- [x] **Step 2.1: Replace `QUIZ_DATA` constant with a category-mode fixture**

```js
const QUIZ_DATA = {
  title: 'WS Тестовий квіз',
  categoryMode: true,
  rounds: [
    {
      options: [
        { category: 'Cat A', question: 'Q1', answers: ['A','B','C','D'], correctAnswer: 0 },
        { category: 'Cat B', question: 'Q2', answers: ['W','X','Y','Z'], correctAnswer: 2 }
      ]
    }
  ]
};
```

- [x] **Step 2.2: Check which tests reference `questions.length` or assumptions from old QUIZ_DATA**

The log line in `handleCreateQuiz` at line 201 references `data.quizData.questions.length`. After step 2.1 the category branch sets `data.quizData.questions = []`, so that log prints `0` — acceptable, no test assertion on that log. No test directly asserts on `questions.length` from QUIZ_DATA. Safe to proceed.

---

### Task 3: Add validation guard and remove else branch from handler

**Files:**
- Modify: `backend/src/websocket-handler-auto.js`

- [x] **Step 3.1: Add early-exit guard at top of validation block**

In `handleCreateQuiz`, immediately after the `if (!data || !data.quizData)` guard (around line 116), add:

```js
// Перевіряємо що квіз є в режимі категорій (обов'язково для всіх квізів)
if (!quizData.categoryMode || !quizData.rounds || !Array.isArray(quizData.rounds)) {
  return respond({ success: false, error: 'Quiz must be in category mode (categoryMode: true)' });
}
```

- [x] **Step 3.2: Remove the `else` branch (standard quiz validation, lines ~145–165)**

Delete everything from `} else {` through the closing `}` of that else block, leaving only the category-mode branch.

---

### Task 4: Run tests and fix regressions

- [x] **Step 4.1: Run websocket tests**

```bash
cd /Users/einhorn/quiz-room-local && npm test -- --testPathPattern=websocket --verbose 2>&1 | tail -40
```
Expected: new test passes; all others still pass.

- [x] **Step 4.2: Run full suite**

```bash
cd /Users/einhorn/quiz-room-local && npm test 2>&1 | tail -10
```
Expected: ≥178 tests passing, 0 failing.

---

### Task 5: Commit

- [x] **Step 5.1: Commit changed files**

```bash
git add backend/src/websocket-handler-auto.js backend/tests/websocket.test.js
git commit -m "feat: require categoryMode on all quizzes — reject standard quizzes at session creation"
```
