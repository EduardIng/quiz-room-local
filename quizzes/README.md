# Quizzes Directory

This directory contains quiz JSON files. All quizzes use **category mode** (the only format supported).

## File Format

```json
{
  "title": "Friday Quiz Night",
  "categoryMode": true,
  "rounds": [
    {
      "options": [
        {
          "category": "Geography",
          "question": "What is the capital of France?",
          "answers": ["Berlin", "Paris", "Madrid", "Rome"],
          "correctAnswer": 1,
          "timeLimit": 20,
          "image": "paris.jpg"
        },
        {
          "category": "Science",
          "question": "What planet is closest to the Sun?",
          "answers": ["Venus", "Earth", "Mercury", "Mars"],
          "correctAnswer": 2
        }
      ]
    }
  ]
}
```

## Fields

- `categoryMode`: Always `true`
- `rounds[]`: Array of rounds. Each round has exactly 2 `options`
- `options[].category`: Category name shown to the chooser
- `options[].correctAnswer`: Index of correct answer (0-based)
- `options[].timeLimit`: Optional — seconds to answer (overrides global `config.json` default)
- `options[].image`: Optional — filename from `media/` folder or full URL
- `options[].audio`: Optional — URL to audio file

## No-Repeat Rule

Adjacent rounds must not share a category name. If round N has category "Geography", round N+1 must not have "Geography" in either option. This is validated both in the quiz editor and on save.
