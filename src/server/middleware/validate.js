/**
 * Zod 스키마를 사용하여 Express req.body 유효성을 검증하는 미들웨어
 */
export const validateBody = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: '요청 데이터 유효성 검증 실패',
        details: result.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }
    // 검증된 데이터를 req.body로 오버라이드 (Zod default 값 등이 정상 반영되도록 함)
    req.body = result.data;
    next();
  };
};
