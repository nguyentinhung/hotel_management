function healthCheck(_req, res) {
  return res.json({ ok: true, message: 'Hotel backend is running' });
}

module.exports = { healthCheck };
