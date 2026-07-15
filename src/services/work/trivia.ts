export interface TriviaQuestion {
  id: string;
  category: string;
  question: string;
  answers: readonly [string, string, string, string];
  correctIndex: number;
}

export interface PreparedTriviaQuestion {
  id: string;
  category: string;
  question: string;
  answers: [string, string, string, string];
  correctIndex: number;
}

export const TRIVIA_QUESTIONS: readonly TriviaQuestion[] = [
  {
    id: 'science-water-formula',
    category: 'Science',
    question: 'What is the chemical formula for water?',
    answers: ['H₂O', 'CO₂', 'O₂', 'NaCl'],
    correctIndex: 0,
  },
  {
    id: 'geography-largest-ocean',
    category: 'Geography',
    question: 'Which is the largest ocean on Earth?',
    answers: ['Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'],
    correctIndex: 0,
  },
  {
    id: 'history-magna-carta',
    category: 'History',
    question: 'In which year was Magna Carta first sealed?',
    answers: ['1215', '1066', '1415', '1666'],
    correctIndex: 0,
  },
  {
    id: 'computing-binary',
    category: 'Computing',
    question: 'Which two digits are used in the binary number system?',
    answers: ['0 and 1', '1 and 2', '0 and 9', '2 and 8'],
    correctIndex: 0,
  },
  {
    id: 'arts-starry-night',
    category: 'Arts',
    question: 'Who painted The Starry Night?',
    answers: ['Vincent van Gogh', 'Claude Monet', 'Pablo Picasso', 'Salvador Dalí'],
    correctIndex: 0,
  },
  {
    id: 'language-noun',
    category: 'Language',
    question: 'Which word is a noun?',
    answers: ['Mountain', 'Quickly', 'Bright', 'Climb'],
    correctIndex: 0,
  },
  {
    id: 'science-red-planet',
    category: 'Science',
    question: 'Which planet is commonly called the Red Planet?',
    answers: ['Mars', 'Venus', 'Jupiter', 'Mercury'],
    correctIndex: 0,
  },
  {
    id: 'geography-capital-canada',
    category: 'Geography',
    question: 'What is the capital city of Canada?',
    answers: ['Ottawa', 'Toronto', 'Vancouver', 'Montreal'],
    correctIndex: 0,
  },
  {
    id: 'general-chess-pieces',
    category: 'General Knowledge',
    question: 'How many pieces does each player begin with in chess?',
    answers: ['16', '12', '18', '20'],
    correctIndex: 0,
  },
  {
    id: 'science-largest-organ',
    category: 'Science',
    question: 'What is the largest organ of the human body?',
    answers: ['Skin', 'Liver', 'Lungs', 'Heart'],
    correctIndex: 0,
  },
  {
    id: 'computing-cpu',
    category: 'Computing',
    question: 'What does CPU stand for?',
    answers: [
      'Central Processing Unit',
      'Computer Personal Utility',
      'Core Program User',
      'Central Power Utility',
    ],
    correctIndex: 0,
  },
  {
    id: 'history-roman-numeral',
    category: 'History',
    question: 'What number does the Roman numeral XL represent?',
    answers: ['40', '60', '90', '15'],
    correctIndex: 0,
  },
] as const;

export function selectTriviaQuestion(random = Math.random): TriviaQuestion {
  const index = Math.min(
    Math.floor(clampRandom(random()) * TRIVIA_QUESTIONS.length),
    TRIVIA_QUESTIONS.length - 1,
  );
  return TRIVIA_QUESTIONS[index];
}

export function prepareTriviaQuestion(
  question: TriviaQuestion,
  random = Math.random,
): PreparedTriviaQuestion {
  const entries = question.answers.map((answer, index) => ({
    answer,
    correct: index === question.correctIndex,
  }));
  for (let index = entries.length - 1; index > 0; index -= 1) {
    const target = Math.floor(clampRandom(random()) * (index + 1));
    [entries[index], entries[target]] = [entries[target], entries[index]];
  }
  return {
    id: question.id,
    category: question.category,
    question: question.question,
    answers: entries.map((entry) => entry.answer) as [string, string, string, string],
    correctIndex: entries.findIndex((entry) => entry.correct),
  };
}

function clampRandom(value: number): number {
  return Math.min(Math.max(value, 0), 1 - Number.EPSILON);
}
