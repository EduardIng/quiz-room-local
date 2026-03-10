# Quizzes Directory

This directory contains quiz JSON files for the automated quiz room system.

## File Format

Each quiz file follows this structure:
```json
{
  "id": "unique-quiz-id",
  "title": "Quiz Title",
  "description": "Quiz description",
  "questions": [
    {
      "id": 1,
      "text": "Question text?",
      "answers": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0,
      "timeLimit": 20
    }
  ]
}
```

## Fields
- `correct`: Index of correct answer (0-based)
- `timeLimit`: Seconds to answer (overrides global config)
