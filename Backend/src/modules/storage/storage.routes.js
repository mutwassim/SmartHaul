const express = require('express');
const router = express.Router();
const storageController = require('./storage.controller');

router.get('/file', storageController.serveSignedFile);

module.exports = router;
