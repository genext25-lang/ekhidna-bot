const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

// Простой ответ на GET-запрос
app.get('/', (req, res) => {
    res.send('Сервер работает!');
});

// Эндпоинт для Telegram Webhook
app.post('/webhook', (req, res) => {
    console.log('Получено обновление от Telegram:', JSON.stringify(req.body));
    // Отвечаем успехом, чтобы Telegram не пересылал запрос снова
    res.sendStatus(200);
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Тестовый сервер запущен на порту ${port}`);
});