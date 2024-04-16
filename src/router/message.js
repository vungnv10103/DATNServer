const express = require('express');
const router = express.Router();
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { checkPermission } = require('../middlewares/middleware');

const MessageService = require('../services/message');


router.post("/add-msg", checkPermission, MessageService.addMessage);


module.exports = router