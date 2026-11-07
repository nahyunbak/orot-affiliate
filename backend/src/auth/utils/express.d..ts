declare namespace Express {
  interface Request {
    user?: any; // 적절한 타입으로 변경 필요
    error?: string;
  }
}
