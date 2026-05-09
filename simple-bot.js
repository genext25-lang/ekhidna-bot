const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

// Эта строчка ОБЯЗАТЕЛЬНА для приёма данных от Telegram
app.use(express.json());

// Главная страница для проверки
app.get('/', (req, res) => {
    res.send('Сервер работает!');
});

// Эндпоинт для Telegram Webhook
app.post('/webhook', (req, res) => {
    console.log('🔥 Получен запрос от Telegram!');
    res.sendStatus(200);
});

app.listen(port, () => {
    console.log(`✅ Сервер запущен на порту ${port}`);
    console.log(`✅ Эндпоинт /webhook готов принимать запросы`);
});