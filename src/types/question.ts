export interface Question {
  id?: string;
  question: string;
  options: string[];
  correctAnswer: number; // index 0-3
  createdAt?: any;
}
