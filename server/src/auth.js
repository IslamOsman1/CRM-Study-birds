import jwt from 'jsonwebtoken';

const secret = () => process.env.JWT_SECRET || 'development-only-secret-change-me';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email, companyId: user.companyId },
    secret(),
    { expiresIn: '12h' }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'مطلوب تسجيل الدخول' });

  try {
    req.user = jwt.verify(token, secret());
    next();
  } catch {
    return res.status(401).json({ message: 'انتهت صلاحية الجلسة أو الرمز غير صالح' });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' });
    }
    next();
  };
}
