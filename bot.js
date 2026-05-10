const { Bot } = require('grammy');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
require('dotenv').config();

// === ПРОВЕРКА НАСТРОЕК ===
const token = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!token) {
    console.error('❌ Ошибка: BOT_TOKEN не найден в .env');
    process.exit(1);
}
if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Ошибка: SUPABASE_URL или SUPABASE_ANON_KEY не найдены');
    process.exit(1);
}

// === ПОДКЛЮЧЕНИЯ ===
const bot = new Bot(token);
const supabase = createClient(supabaseUrl, supabaseKey);

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function getRankName(level) {
    const ranks = { 1: 'Бродяга', 2: 'Шестёрка', 3: 'Боец', 4: 'Капо', 5: 'Консильери', 6: 'Дон' };
    return ranks[level] || 'Неизвестно';
}

function getChoiceName(choice) {
    const names = { rock: '🪨 КАМЕНЬ', paper: '📄 БУМАГА', scissors: '✂️ НОЖНИЦЫ' };
    return names[choice] || choice;
}

async function determineWinner(choice1, choice2, creatorId, opponentId) {
    if (choice1 === choice2) {
        return { text: `🤝 НИЧЬЯ! Оба выбрали ${getChoiceName(choice1)}`, winnerId: null };
    }
    if (
        (choice1 === 'rock' && choice2 === 'scissors') ||
        (choice1 === 'scissors' && choice2 === 'paper') ||
        (choice1 === 'paper' && choice2 === 'rock')
    ) {
        return { text: `🥇 ПОБЕДИЛ СОЗДАТЕЛЬ КОМНАТЫ!\n${getChoiceName(choice1)} побеждает ${getChoiceName(choice2)}`, winnerId: creatorId };
    }
    return { text: `🥇 ПОБЕДИЛ СОПЕРНИК!\n${getChoiceName(choice2)} побеждает ${getChoiceName(choice1)}`, winnerId: opponentId };
}

async function updateStats(winnerId, loserId) {
    const { data: winner } = await supabase
        .from('users')
        .select('wins, xp')
        .eq('id', winnerId)
        .single();
    
    await supabase
        .from('users')
        .update({ 
            wins: (winner?.wins || 0) + 1, 
            xp: (winner?.xp || 0) + 50 
        })
        .eq('id', winnerId);
    
    const { data: loser } = await supabase
        .from('users')
        .select('losses, xp')
        .eq('id', loserId)
        .single();
    
    await supabase
        .from('users')
        .update({ 
            losses: (loser?.losses || 0) + 1, 
            xp: (loser?.xp || 0) + 10 
        })
        .eq('id', loserId);
    
    const { data: w } = await supabase
        .from('users')
        .select('xp')
        .eq('id', winnerId)
        .single();
    const { data: l } = await supabase
        .from('users')
        .select('xp')
        .eq('id', loserId)
        .single();
    
    const newRankW = Math.min(6, 1 + Math.floor((w?.xp || 0) / 100));
    const newRankL = Math.min(6, 1 + Math.floor((l?.xp || 0) / 100));
    
    await supabase
        .from('users')
        .update({ rank_level: newRankW })
        .eq('id', winnerId);
    await supabase
        .from('users')
        .update({ rank_level: newRankL })
        .eq('id', loserId);
}

// === ПОКАЗ ПРОФИЛЯ ===
async function showProfile(ctx) {
    const userId = ctx.from.id.toString();
    const username = ctx.from.username || 'без_имени';

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error || !user) {
            await ctx.reply('❌ Профиль не найден. Напишите /start.');
            return;
        }

        await ctx.reply(
            `🎩 ПРОФИЛЬ ЕХИДНЫ НАКЛЗ\n\n` +
            `👤 Имя: @${user.username || username}\n` +
            `🆔 ID: ${user.id}\n` +
            `⭐ Ранг: ${user.rank_level} (${getRankName(user.rank_level)})\n` +
            `📊 XP: ${user.xp}\n` +
            `🏆 Победы: ${user.wins || 0} | Поражения: ${user.losses || 0}\n` +
            `🎭 Скин: ${user.current_skin || 'Обычная Ехидна'}`
        );
    } catch (err) {
        console.error('Ошибка в showProfile:', err);
        await ctx.reply('⚠️ Ошибка при загрузке профиля.');
    }
}

// === УСТАНОВКА МЕНЮ БОТА ===
bot.api.setMyCommands([
    { command: 'start', description: '🏠 Начать игру' },
    { command: 'profile', description: '📊 Мой профиль' },
    { command: 'check', description: '🔍 Мои комнаты' }
]).then(() => {
    console.log('✅ Меню бота обновлено');
});

// === КОМАНДА /start ===
bot.command('start', async (ctx) => {
    const user = ctx.from;
    const userId = user.id.toString();
    const username = user.username || 'без_имени';
    const firstName = user.first_name || '';

    try {
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('id', userId)
            .single();

        if (!existingUser) {
            await supabase.from('users').insert([{
                id: userId,
                username: username,
                xp: 0,
                rank_level: 1,
                wins: 0,
                losses: 0,
                current_skin: 'Обычная Ехидна'
            }]);
            await ctx.reply(
                `🦔 **Привет, ${firstName}!**\n\n` +
                `Добро пожаловать в криминальный мир **Ехидны Наклз**!\n\n` +
                `✅ Твой аккаунт создан.\n\n` +
                `**Как играть:**\n` +
                `1️⃣ Нажми кнопку **"PLAY"** в левом нижнем углу\n` +
                `2️⃣ Выбери **«СОЗДАТЬ КОМНАТУ»**\n` +
                `3️⃣ Отправь ссылку другу\n` +
                `4️⃣ Когда друг присоединится, выберите жест\n` +
                `5️⃣ Побеждай и получай XP!\n\n` +
                `📊 Используй /profile, чтобы посмотреть свой прогресс.`
            );
        } else {
            await ctx.reply(
                `🦔 **С возвращением, ${firstName}!**\n\n` +
                `Нажми кнопку **"PLAY"** в левом нижнем углу, чтобы продолжить.\n\n` +
                `📊 Используй /profile, чтобы посмотреть свой прогресс.`
            );
        }
    } catch (err) {
        console.error('Ошибка в /start:', err);
        await ctx.reply('⚠️ Техническая ошибка. Попробуйте позже.');
    }
});

// === КОМАНДА /profile ===
bot.command('profile', async (ctx) => {
    await showProfile(ctx);
});

// === КОМАНДА /check ===
bot.command('check', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    const { data: rooms, error } = await supabase
        .from('rooms')
        .select('*')
        .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`)
        .order('created_at', { ascending: false });
    
    if (error || !rooms || rooms.length === 0) {
        await ctx.reply('❌ Нет комнат для вашего аккаунта.');
        return;
    }
    
    let message = '📋 Ваши комнаты:\n\n';
    for (const room of rooms) {
        message += `ID: ${room.id.substring(0, 30)}...\n`;
        message += `Статус: ${room.status}\n`;
        message += `Создатель: ${room.creator_id === userId ? 'вы' : room.creator_id}\n`;
        message += `Соперник: ${room.opponent_id === userId ? 'вы' : (room.opponent_id || 'нет')}\n`;
        message += `---\n`;
    }
    
    await ctx.reply(message);
});

// === ОБРАБОТКА ДАННЫХ ИЗ МИНИ-ПРИЛОЖЕНИЯ ===
bot.on('message:web_app_data', async (ctx) => {
    console.log('🔔 web_app_data ПОЛУЧЕНО!');
    console.log('Сырые данные:', ctx.webAppData.data);
    
    let data;
    try {
        data = JSON.parse(ctx.webAppData.data);
        console.log('📦 Распарсено:', data);
    } catch (e) {
        console.error('❌ Ошибка парсинга JSON:', e);
        await ctx.reply(JSON.stringify({ type: 'error', message: 'Неверный формат данных' }));
        return;
    }
    
    const userId = ctx.from.id.toString();
    
    // === СОЗДАНИЕ КОМНАТЫ ===
    if (data.action === 'create_room') {
        console.log(`🏠 Создание комнаты для пользователя ${userId}`);
        const bet = data.bet || 0.1;
        const roomId = `room_${Date.now()}_${userId}`;
        
        const { error } = await supabase
            .from('rooms')
            .insert([{
                id: roomId,
                creator_id: userId,
                bet_amount: bet,
                status: 'waiting'
            }]);
        
        if (error) {
            console.error('❌ Ошибка создания комнаты:', error);
            await ctx.reply(JSON.stringify({ type: 'error', message: 'Не удалось создать комнату: ' + error.message }));
            return;
        }
        
        console.log(`✅ Комната создана: ${roomId}`);
        await ctx.reply(JSON.stringify({
            type: 'room_created',
            roomId: roomId,
            betAmount: bet
        }));
        return;
    }
    
    // === ПРИСОЕДИНЕНИЕ К КОМНАТЕ ===
    if (data.action === 'join_room') {
        console.log(`🔗 Присоединение к комнате ${data.roomId} от пользователя ${userId}`);
        const roomId = data.roomId;
        
        const { data: room, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .single();
        
        if (error || !room) {
            console.error('❌ Комната не найдена:', error);
            await ctx.reply(JSON.stringify({ type: 'error', message: 'Комната не найдена' }));
            return;
        }
        
        if (room.status !== 'waiting') {
            await ctx.reply(JSON.stringify({ type: 'error', message: 'Комната уже занята' }));
            return;
        }
        
        if (room.creator_id === userId) {
            await ctx.reply(JSON.stringify({ type: 'error', message: 'Нельзя присоединиться к своей комнате' }));
            return;
        }
        
        await supabase
            .from('rooms')
            .update({ opponent_id: userId, status: 'playing' })
            .eq('id', room.id);
        
        console.log(`✅ Игрок ${userId} присоединился к комнате ${roomId}`);
        
        await ctx.reply(JSON.stringify({
            type: 'room_joined',
            roomId: room.id,
            betAmount: room.bet_amount
        }));
        
        // Уведомляем создателя
        await bot.api.sendMessage(room.creator_id, JSON.stringify({
            type: 'game_started',
            roomId: room.id
        }));
        return;
    }
    
    // === ИГРОК ГОТОВ ===
    if (data.action === 'player_ready') {
        const roomId = data.roomId;
        console.log(`✅ Игрок ${userId} готов в комнате ${roomId}`);
        
        // Здесь можно добавить логику ожидания обоих игроков
        await ctx.reply(JSON.stringify({
            type: 'waiting',
            message: 'Ожидаем готовности соперника...'
        }));
        return;
    }
    
    // === ВЫБОР ЖЕСТА ===
    if (data.action === 'make_choice') {
        const choice = data.choice;
        let roomId = data.roomId;
        
        if (!roomId) {
            const { data: room } = await supabase
                .from('rooms')
                .select('id')
                .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`)
                .eq('status', 'playing')
                .single();
            roomId = room?.id;
        }
        
        if (!roomId) {
            await ctx.reply(JSON.stringify({ type: 'error', message: 'Нет активной комнаты' }));
            return;
        }
        
        console.log(`🎮 Выбор жеста от ${userId}: ${choice} в комнате ${roomId}`);
        
        const { data: room, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .single();
        
        if (error || !room || room.status !== 'playing') {
            await ctx.reply(JSON.stringify({ type: 'error', message: 'Игра уже завершена' }));
            return;
        }
        
        const isCreator = (room.creator_id === userId);
        const updateField = isCreator ? 'creator_choice' : 'opponent_choice';
        
        await supabase
            .from('rooms')
            .update({ [updateField]: choice })
            .eq('id', room.id);
        
        await ctx.reply(JSON.stringify({ 
            type: 'choice_confirmed', 
            choice: choice 
        }));
        
        const { data: updatedRoom } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', room.id)
            .single();
        
        if (updatedRoom.creator_choice && updatedRoom.opponent_choice) {
            console.log('🏆 Оба игрока сделали выбор, определяем победителя');
            
            const result = await determineWinner(
                updatedRoom.creator_choice,
                updatedRoom.opponent_choice,
                updatedRoom.creator_id,
                updatedRoom.opponent_id
            );
            
            await supabase
                .from('rooms')
                .update({ status: 'finished', winner_id: result.winnerId })
                .eq('id', room.id);
            
            if (result.winnerId) {
                const loserId = result.winnerId === updatedRoom.creator_id ? updatedRoom.opponent_id : updatedRoom.creator_id;
                await updateStats(result.winnerId, loserId);
            }
            
            await ctx.reply(JSON.stringify({ 
                type: 'game_result', 
                result: result.text 
            }));
            
            await bot.api.sendMessage(updatedRoom.creator_id, `🏆 ${result.text}`);
            if (updatedRoom.opponent_id) {
                await bot.api.sendMessage(updatedRoom.opponent_id, `🏆 ${result.text}`);
            }
        }
        return;
    }
});

// === ВЕБ-СЕРВЕР ===
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

app.get('/', (req, res) => {
    res.send('🦔 Бот Ехидны Наклз работает');
});

app.post('/webhook', async (req, res) => {
    try {
        if (!bot.botInfo) {
            await bot.init();
        }
        await bot.handleUpdate(req.body);
        res.sendStatus(200);
    } catch (err) {
        console.error('Ошибка обработки webhook:', err);
        res.sendStatus(500);
    }
});

// === ИНИЦИАЛИЗАЦИЯ И ЗАПУСК ===
async function start() {
    await bot.init();
    console.log(`🤖 Бот ${bot.botInfo.username} инициализирован`);
    
    const WEBHOOK_URL = `https://ekhidna-game-v1-0.onrender.com/webhook`;
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    await bot.api.setWebhook(WEBHOOK_URL);
    console.log(`✅ Webhook установлен на ${WEBHOOK_URL}`);
    
    app.listen(port, '0.0.0.0', () => {
        console.log(`✅ Веб-сервер на порту ${port}`);
        console.log(`🦔 Бот ${bot.botInfo.username} готов принимать обновления`);
    });
}

start().catch(err => {
    console.error('❌ Критическая ошибка при запуске:', err);
    process.exit(1);
});