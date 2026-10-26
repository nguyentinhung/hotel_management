const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowed.includes(file.mimetype)) return callback(null, true);
    return callback(new Error('Ch\u1ec9 ch\u1ea5p nh\u1eadn \u1ea3nh JPG, PNG, WEBP.'));
  },
});

const uploadIdCardImage = (req, res, next) => upload.single('id_card_image')(req, res, (error) => {
  if (!error) return next();
  const message = error.code === 'LIMIT_FILE_SIZE'
    ? '\u1ea2nh CCCD kh\u00f4ng \u0111\u01b0\u1ee3c v\u01b0\u1ee3t qu\u00e1 5 MB.'
    : error.message || 'Kh\u00f4ng th\u1ec3 nh\u1eadn \u1ea3nh CCCD.';
  return res.status(400).json({ success: false, message });
});

const uploadRoomTypeImage = (req, res, next) => upload.single('image')(req, res, next);

module.exports = { uploadIdCardImage, uploadRoomTypeImage };
