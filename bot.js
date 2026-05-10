const { Bot } = require('grammy');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
require('dotenv').config();

const token = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!token || !supabaseUrl || !supabaseKey) {
    console.error('❌ Ошибка: не все переменные окружения найдены');
    process.exit(1);
}

const bot = new Bot(token);
const supabase = createClient(supabaseUrl, supabaseKey);

function getChoiceName(choice) {
    const names = { rock: '🪨 КАМЕНЬ', paper: '📄 БУМАГА', scissors: '✂️ НОЖНИЦЫ' };
    return names[choice] || choice;
}

// === УСТАНОВКА МЕНЮ ===
bot.api.setMyCommands([
    { command: 'start', description: '🏠 Начать игру' },
    { command: 'create_room', description: '🎮 Создать комнату' },
    { command: 'profile', description: '📊 Мой профиль' },
    { command: 'help', description: '❓ Помощь' }
]);

// === КОМАНДА /start ===
bot.command('start', async (ctx) => {
    const userId = ctx.from.id.toString();
    const firstName = ctx.from.first_name || '';
    
    const { data: existing } = await supabase.from('users').select('id').eq('id', userId).single();
    if (!existing) {
        await supabase.from('users').insert([{ 
            id: userId, 
            username: ctx.from.username || 'anon', 
            xp: 0, 
            rank_level: 1, 
            wins: 0, 
            losses: 0, 
            current_skin: 'Обычная Ехидна' 
        }]);
        await ctx.reply(`🦔 **Привет, ${firstName}!**\n\nАккаунт создан!\n\nИспользуй команду /create_room, чтобы начать игру.`);
    } else {
        await ctx.reply(`🦔 **С возвращением, ${firstName}!**\n\nИспользуй команду /create_room, чтобы начать игру.`);
    }
});

// === КОМАНДА /create_room ===
bot.command('create_room', async (ctx) => {
    const userId = ctx.from.id.toString();
    const roomId = `room_${Date.now()}_${userId}`;
    
    console.log(`🏠 Создание комнаты ${roomId} для пользователя ${userId}`);
    
    const { error } = await supabase
        .from('rooms')
        .insert([{
            id: roomId,
            creator_id: userId,
            bet_amount: 0.1,
            status: 'waiting'
        }]);
    
    if (error) {
        console.error('❌ Ошибка создания комнаты:', error);
        await ctx.reply('❌ Не удалось создать комнату. Попробуйте позже.');
        return;
    }
    
    await ctx.reply(
        `✅ **КОМНАТА СОЗДАНА!**\n\n` +
        `🎲 Код комнаты: \`${roomId}\`\n\n` +
        `🔗 **Отправь другу ссылку:**\n` +
        `https://t.me/${bot.botInfo.username}?start=join_${roomId}\n\n` +
        `⚔️ Когда друг перейдёт по ссылке, выберите жест в чате!`,
        { parse_mode: 'Markdown' }
    );
});

// === ОБРАБОТКА ПРИСОЕДИНЕНИЯ ===
bot.command('start', async (ctx) => {
    const payload = ctx.match;
    const userId = ctx.from.id.toString();
    
    // Присоединение по ссылке join_xxx
    if (payload && payload.startsWith('join_')) {
        const roomId = payload.substring(5);
        console.log(`🔗 Присоединение к комнате ${roomId} от ${userId}`);
        
        const { data: room, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .single();
        
        if (error || !room) {
            await ctx.reply('❌ Комната не найдена.');
            return;
        }
        
        if (room.status !== 'waiting') {
            await ctx.reply('❌ Комната уже занята.');
            return;
        }
        
        if (room.creator_id === userId) {
            await ctx.reply('❌ Нельзя присоединиться к своей комнате.');
            return;
        }
        
        await supabase
            .from('rooms')
            .update({ opponent_id: userId, status: 'playing' })
            .eq('id', room.id);
        
        await ctx.reply(`✅ **ВЫ ПРИСОЕДИНИЛИСЬ!**\n\n⚔️ Игра началась! Выберите жест:`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🪨 КАМЕНЬ', callback_data: `choice_${room.id}_rock` },
                        { text: '📄 БУМАГА', callback_data: `choice_${room.id}_paper` },
                        { text: '✂️ НОЖНИЦЫ', callback_data: `choice_${room.id}_scissors` }
                    ]
                ]
            }
        });
        
        await bot.api.sendMessage(room.creator_id, `🎮 **СОПЕРНИК ПРИСОЕДИНИЛСЯ!**\n\nВыберите жест:`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🪨 КАМЕНЬ', callback_data: `choice_${room.id}_rock` },
                        { text: '📄 БУМАГА', callback_data: `choice_${room.id}_paper` },
                        { text: '✂️ НОЖНИЦЫ', callback_data: `choice_${room.id}_scissors` }
                    ]
                ]
            }
        });
        return;
    }
    
    // Обычный старт (регистрация) — пропускаем, если уже обработали join
    if (!payload || payload === 'start') {
        const firstName = ctx.from.first_name || '';
        const { data: existing } = await supabase.from('users').select('id').eq('id', userId).single();
        if (!existing) {
            await supabase.from('users').insert([{ 
                id: userId, 
                username: ctx.from.username || 'anon', 
                xp: 0, 
                rank_level: 1, 
                wins: 0, 
                losses: 0, 
                current_skin: 'Обычная Ехидна' 
            }]);
            await ctx.reply(`🦔 **Привет, ${firstName}!**\n\nАккаунт создан!\n\nИспользуй команду /create_room, чтобы начать игру.`);
        } else {
            await ctx.reply(`🦔 **С возвращением, ${firstName}!**\n\nИспользуй команду /create_room, чтобы начать игру.`);
        }
    }
});

// === ВЫБОР ЖЕСТА ===
bot.callbackQuery(/^choice_(.+)_(rock|paper|scissors)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const choice = ctx.match[2];
    const userId = ctx.from.id.toString();
    
    await ctx.answerCallbackQuery();
    
    const { data: room } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();
    
    if (!room || room.status !== 'playing') {
        await ctx.reply('❌ Игра уже завершена.');
        return;
    }
    
    const isCreator = (room.creator_id === userId);
    const field = isCreator ? 'creator_choice' : 'opponent_choice';
    
    await supabase
        .from('rooms')
        .update({ [field]: choice })
        .eq('id', room.id);
    
    await ctx.editMessageText(
        `✅ Вы выбрали: ${getChoiceName(choice)}\n⏳ Ожидаем выбора соперника...`,
        { reply_markup: undefined }
    );
    
    const { data: updated } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', room.id)
        .single();
    
    if (updated.creator_choice && updated.opponent_choice) {
        const p1 = updated.creator_choice;
        const p2 = updated.opponent_choice;
        let result = '';
        let winnerId = null;
        
        if (p1 === p2) {
            result = `🤝 НИЧЬЯ!`;
        } else if (
            (p1 === 'rock' && p2 === 'scissors') ||
            (p1 === 'scissors' && p2 === 'paper') ||
            (p1 === 'paper' && p2 === 'rock')
        ) {
            result = `🥇 ПОБЕДИЛ СОЗДАТЕЛЬ!\n${getChoiceName(p1)} побеждает ${getChoiceName(p2)}`;
            winnerId = updated.creator_id;
        } else {
            result = `🥇 ПОБЕДИЛ СОПЕРНИК!\n${getChoiceName(p2)} побеждает ${getChoiceName(p1)}`;
            winnerId = updated.opponent_id;
        }
        
        await supabase
            .from('rooms')
            .update({ status: 'finished', winner_id: winnerId })
            .eq('id', room.id);
        
        if (winnerId) {
            const loserId = winnerId === updated.creator_id ? updated.opponent_id : updated.creator_id;
            await supabase
                .from('users')
                .update({ wins: supabase.raw('wins + 1'), xp: supabase.raw('xp + 50') })
                .eq('id', winnerId);
            await supabase
                .from('users')
                .update({ losses: supabase.raw('losses + 1'), xp: supabase.raw('xp + 10') })
                .eq('id', loserId);
        }
        
        await bot.api.sendMessage(updated.creator_id, `🏆 ${result}`);
        if (updated.opponent_id) {
            await bot.api.sendMessage(updated.opponent_id, `🏆 ${result}`);
        }
    }
});

// === КОМАНДА /profile ===
bot.command('profile', async (ctx) => {
    const userId = ctx.from.id.toString();
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
    
    if (error || !user) {
        await ctx.reply('❌ Профиль не найден. Напишите /start.');
        return;
    }
    
    const rankNames = { 1: 'Бродяга', 2: 'Шестёрка', 3: 'Боец', 4: 'Капо', 5: 'Консильери', 6: 'Дон' };
    
    await ctx.reply(
        `🎩 **ПРОФИЛЬ ЕХИДНЫ НАКЛЗ**\n\n` +
        `👤 Имя: @${user.username || 'без_имени'}\n` +
        `🆔 ID: ${user.id}\n` +
        `⭐ Ранг: ${user.rank_level} (${rankNames[user.rank_level] || 'Неизвестно'})\n` +
        `📊 XP: ${user.xp}\n` +
        `🏆 Победы: ${user.wins || 0} | Поражения: ${user.losses || 0}\n` +
        `🎭 Скин: ${user.current_skin || 'Обычная Ехидна'}`
    );
});

// === КОМАНДА /help ===
bot.command('help', async (ctx) => {
    await ctx.reply(
        `📋 **Доступные команды:**\n\n` +
        `/start — Начать игру\n` +
        `/create_room — Создать комнату\n` +
        `/profile — Посмотреть профиль\n` +
        `/help — Помощь\n\n` +
        `**Как играть:**\n` +
        `1️⃣ /create_room — создайте комнату\n` +
        `2️⃣ Отправьте ссылку другу\n` +
        `3️⃣ Друг переходит по ссылке\n` +
        `4️⃣ Оба выбираете жест\n` +
        `5️⃣ Получаете результат!`
    );
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
        console.error('Ошибка webhook:', err);
        res.sendStatus(500);
    }
});

// === ЗАПУСК ===
async function start() {
    await bot.init();
    console.log(`🤖 Бот ${bot.botInfo.username} инициализирован`);
    
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    await bot.api.setWebhook(`https://ekhidna-game-v1-0.onrender.com/webhook`);
    console.log(`✅ Webhook установлен на https://ekhidna-game-v1-0.onrender.com/webhook`);
    
    app.listen(port, '0.0.0.0', () => {
        console.log(`✅ Веб-сервер на порту ${port}`);
    });
}

start().catch(err => {
    console.error('❌ Ошибка запуска:', err);
    process.exit(1);
});