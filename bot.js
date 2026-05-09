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

// === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ===
function getRankName(level) {
    const ranks = { 1: 'Бродяга', 2: 'Шестёрка', 3: 'Боец', 4: 'Капо', 5: 'Консильери', 6: 'Дон' };
    return ranks[level] || 'Неизвестно';
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
    { command: 'create_room', description: '🎮 Создать комнату' },
    { command: 'choice', description: '⚔️ Выбрать жест (кнопки в чате)' },
    { command: 'check', description: '🔍 Мои комнаты' }
]).then(() => {
    console.log('✅ Меню бота обновлено');
});

// === КОМАНДА /start ===
bot.command('start', async (ctx) => {
    const payload = ctx.match;

    // --- ПРИСОЕДИНЕНИЕ К КОМНАТЕ ---
    if (payload && payload.startsWith('room_')) {
        const roomId = payload;
        const userId = ctx.from.id.toString();

        console.log(`🔗 Присоединение к комнате ${roomId} от пользователя ${userId}`);

        const { data: room, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .single();

        if (error || !room) {
            console.error('Ошибка поиска комнаты:', error);
            await ctx.reply('❌ Комната не найдена.');
            return;
        }

        if (room.status !== 'waiting') {
            await ctx.reply('❌ Комната уже занята или игра началась.');
            return;
        }

        if (room.creator_id === userId) {
            await ctx.reply('❌ Нельзя присоединиться к своей комнате.');
            return;
        }

        const { error: updateError } = await supabase
            .from('rooms')
            .update({ 
                opponent_id: userId, 
                status: 'playing' 
            })
            .eq('id', roomId);

        if (updateError) {
            console.error('Ошибка обновления комнаты:', updateError);
            await ctx.reply('❌ Не удалось присоединиться. Попробуйте позже.');
            return;
        }

        console.log(`✅ Комната ${roomId} обновлена: статус playing, соперник ${userId}`);

        // Сообщение присоединившемуся игроку
        await ctx.reply(
            `🎮 Вы присоединились к комнате!\n\nСтавка: ${room.bet_amount} TON\n\nИгра началась!\n\nВыберите жест через мини-приложение или команду /choice`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎮 ИГРАТЬ (выбор жеста)', web_app: { url: 'https://reliable-kringle-83dc61.netlify.app/' } }]
                    ]
                }
            }
        );

        // Сообщение создателю комнаты
        await bot.api.sendMessage(
            room.creator_id,
            `🎮 Соперник присоединился!\n\nИгра началась!\n\nВыберите жест через мини-приложение или команду /choice`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎮 ИГРАТЬ (выбор жеста)', web_app: { url: 'https://reliable-kringle-83dc61.netlify.app/' } }]
                    ]
                }
            }
        );
        return;
    }

    // --- ОБЫЧНАЯ РЕГИСТРАЦИЯ ---
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
                `🦔 Привет, ${firstName}!\n\nАккаунт создан.\n\nНажми на кнопку, чтобы войти в игру.`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🎮 ИГРАТЬ', web_app: { url: 'https://reliable-kringle-83dc61.netlify.app/' } }]
                        ]
                    }
                }
            );
        } else {
            await ctx.reply(
                `🦔 С возвращением, ${firstName}!\n\nНажми на кнопку, чтобы продолжить.`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🎮 ИГРАТЬ', web_app: { url: 'https://reliable-kringle-83dc61.netlify.app/' } }]
                        ]
                    }
                }
            );
        }
    } catch (err) {
        console.error('Ошибка в /start:', err);
        await ctx.reply('⚠️ Техническая ошибка.');
    }
});

// === КОМАНДА /profile ===
bot.command('profile', async (ctx) => {
    await showProfile(ctx);
});

// === КОМАНДА /create_room ===
bot.command('create_room', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    let bet = 0.1;
    if (args[1] && !isNaN(parseFloat(args[1]))) {
        bet = parseFloat(args[1]);
        if (bet < 0.1) bet = 0.1;
        if (bet > 5) bet = 5;
    }

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
        console.error('Ошибка create_room:', error);
        await ctx.reply('❌ Не удалось создать комнату.');
        return;
    }

    await ctx.reply(
        `✅ Комната создана!\n\nСтавка: ${bet} TON\n\nСсылка для соперника:\nhttps://t.me/EkhidnaNaklzBot?start=${roomId}`
    );
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

// === КОМАНДА /choice (гарантированно работающий выбор через кнопки в чате) ===
bot.command('choice', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    const { data: rooms, error } = await supabase
        .from('rooms')
        .select('id')
        .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`)
        .eq('status', 'playing');
    
    if (error || !rooms || rooms.length === 0) {
        await ctx.reply('❌ Нет активной игры. Создайте комнату через /create_room');
        return;
    }
    
    const roomId = rooms[0].id;
    await ctx.reply('🎮 Выберите свой жест:', {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🪨 КАМЕНЬ', callback_data: `game_${roomId}_rock` },
                    { text: '📄 БУМАГА', callback_data: `game_${roomId}_paper` },
                    { text: '✂️ НОЖНИЦЫ', callback_data: `game_${roomId}_scissors` }
                ]
            ]
        }
    });
});

// === ОБРАБОТКА ВЫБОРА ЖЕСТА (из кнопок в чате) ===
bot.callbackQuery(/^game_(.+)_(rock|paper|scissors)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const choice = ctx.match[2];
    const userId = ctx.from.id.toString();
    
    await ctx.answerCallbackQuery();
    
    const { data: room, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();
    
    if (error || !room || room.status !== 'playing') {
        await ctx.reply('❌ Игра уже завершена.');
        return;
    }
    
    const isCreator = (room.creator_id === userId);
    const updateField = isCreator ? 'creator_choice' : 'opponent_choice';
    
    await supabase
        .from('rooms')
        .update({ [updateField]: choice })
        .eq('id', room.id);
    
    const { data: updatedRoom } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', room.id)
        .single();
    
    const choiceNames = { rock: '🪨 КАМЕНЬ', paper: '📄 БУМАГА', scissors: '✂️ НОЖНИЦЫ' };
    
    if (updatedRoom.creator_choice && updatedRoom.opponent_choice) {
        // ОБА ВЫБРАЛИ — ОПРЕДЕЛЯЕМ ПОБЕДИТЕЛЯ
        const p1 = updatedRoom.creator_choice;
        const p2 = updatedRoom.opponent_choice;
        let result = '';
        let winnerId = '';
        
        if (p1 === p2) {
            result = `🤝 НИЧЬЯ! Оба выбрали ${choiceNames[p1]}`;
        } else if (
            (p1 === 'rock' && p2 === 'scissors') ||
            (p1 === 'scissors' && p2 === 'paper') ||
            (p1 === 'paper' && p2 === 'rock')
        ) {
            result = `🥇 ПОБЕДИЛ СОЗДАТЕЛЬ КОМНАТЫ!\n${choiceNames[p1]} побеждает ${choiceNames[p2]}`;
            winnerId = updatedRoom.creator_id;
        } else {
            result = `🥇 ПОБЕДИЛ СОПЕРНИК!\n${choiceNames[p2]} побеждает ${choiceNames[p1]}`;
            winnerId = updatedRoom.opponent_id;
        }
        
        await supabase
            .from('rooms')
            .update({ status: 'finished', winner_id: winnerId })
            .eq('id', room.id);
        
        if (winnerId) {
            const loserId = winnerId === updatedRoom.creator_id ? updatedRoom.opponent_id : updatedRoom.creator_id;
            
            // Получаем текущие данные
            const { data: winner } = await supabase
                .from('users')
                .select('wins, xp')
                .eq('id', winnerId)
                .single();
            
            const { data: loser } = await supabase
                .from('users')
                .select('losses, xp')
                .eq('id', loserId)
                .single();
            
            // Обновляем победителя
            await supabase
                .from('users')
                .update({ 
                    wins: (winner?.wins || 0) + 1, 
                    xp: (winner?.xp || 0) + 50 
                })
                .eq('id', winnerId);
            
            // Обновляем проигравшего
            await supabase
                .from('users')
                .update({ 
                    losses: (loser?.losses || 0) + 1, 
                    xp: (loser?.xp || 0) + 10 
                })
                .eq('id', loserId);
            
            // Обновляем ранги
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
        
        await ctx.editMessageText(`🏆 ИГРА ЗАВЕРШЕНА!\n\n${result}`, { reply_markup: undefined });
        await bot.api.sendMessage(updatedRoom.creator_id, `🏆 ИГРА ЗАВЕРШЕНА!\n\n${result}`);
        if (updatedRoom.opponent_id) {
            await bot.api.sendMessage(updatedRoom.opponent_id, `🏆 ИГРА ЗАВЕРШЕНА!\n\n${result}`);
        }
    } else {
        const who = isCreator ? 'Создатель комнаты' : 'Соперник';
        const waitingFor = isCreator ? 'соперника' : 'создателя комнаты';
        await ctx.editMessageText(
            `✅ ${who} выбрал ${choiceNames[choice]}\n\n⏳ Ожидаем выбора ${waitingFor}...`,
            { reply_markup: undefined }
        );
    }
});

// === ОБРАБОТКА ВЫБОРА ЖЕСТА ИЗ МИНИ-ПРИЛОЖЕНИЯ ===
bot.on('message:web_app_data', async (ctx) => {
    const choice = ctx.webAppData.data;
    const userId = ctx.from.id.toString();
    
    console.log(`📩 Выбор из мини-приложения от ${userId}: ${choice}`);
    
    if (!['rock', 'paper', 'scissors'].includes(choice)) {
        await ctx.reply('❌ Неверный выбор жеста.');
        return;
    }
    
    const { data: rooms, error } = await supabase
        .from('rooms')
        .select('*')
        .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`)
        .eq('status', 'playing');
    
    if (error || !rooms || rooms.length === 0) {
        await ctx.reply('❌ Нет активной игры.');
        return;
    }
    
    const room = rooms[0];
    const isCreator = (room.creator_id === userId);
    const updateField = isCreator ? 'creator_choice' : 'opponent_choice';
    
    await supabase
        .from('rooms')
        .update({ [updateField]: choice })
        .eq('id', room.id);
    
    const { data: updatedRoom } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', room.id)
        .single();
    
    const choiceNames = { rock: '🪨 КАМЕНЬ', paper: '📄 БУМАГА', scissors: '✂️ НОЖНИЦЫ' };
    
    if (updatedRoom.creator_choice && updatedRoom.opponent_choice) {
        const p1 = updatedRoom.creator_choice;
        const p2 = updatedRoom.opponent_choice;
        let result = '';
        let winnerId = '';
        
        if (p1 === p2) {
            result = `🤝 НИЧЬЯ! Оба выбрали ${choiceNames[p1]}`;
        } else if (
            (p1 === 'rock' && p2 === 'scissors') ||
            (p1 === 'scissors' && p2 === 'paper') ||
            (p1 === 'paper' && p2 === 'rock')
        ) {
            result = `🥇 ПОБЕДИЛ СОЗДАТЕЛЬ КОМНАТЫ!\n${choiceNames[p1]} побеждает ${choiceNames[p2]}`;
            winnerId = updatedRoom.creator_id;
        } else {
            result = `🥇 ПОБЕДИЛ СОПЕРНИК!\n${choiceNames[p2]} побеждает ${choiceNames[p1]}`;
            winnerId = updatedRoom.opponent_id;
        }
        
        await supabase
            .from('rooms')
            .update({ status: 'finished', winner_id: winnerId })
            .eq('id', room.id);
        
        if (winnerId) {
            const loserId = winnerId === updatedRoom.creator_id ? updatedRoom.opponent_id : updatedRoom.creator_id;
            
            const { data: winner } = await supabase
                .from('users')
                .select('wins, xp')
                .eq('id', winnerId)
                .single();
            const { data: loser } = await supabase
                .from('users')
                .select('losses, xp')
                .eq('id', loserId)
                .single();
            
            await supabase
                .from('users')
                .update({ wins: (winner?.wins || 0) + 1, xp: (winner?.xp || 0) + 50 })
                .eq('id', winnerId);
            await supabase
                .from('users')
                .update({ losses: (loser?.losses || 0) + 1, xp: (loser?.xp || 0) + 10 })
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
        
        await ctx.reply(`🏆 ИГРА ЗАВЕРШЕНА!\n\n${result}`);
        await bot.api.sendMessage(updatedRoom.creator_id, `🏆 ИГРА ЗАВЕРШЕНА!\n\n${result}`);
        if (updatedRoom.opponent_id) {
            await bot.api.sendMessage(updatedRoom.opponent_id, `🏆 ИГРА ЗАВЕРШЕНА!\n\n${result}`);
        }
    } else {
        const who = isCreator ? 'Создатель комнаты' : 'Соперник';
        const waitingFor = isCreator ? 'соперника' : 'создателя комнаты';
        await ctx.reply(`✅ ${who} выбрал ${choiceNames[choice]}\n\n⏳ Ожидаем выбора ${waitingFor}...`);
    }
});

// === ВЕБ-СЕРВЕР И WEBHOOK ===
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