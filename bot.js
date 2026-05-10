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
    // Обновляем победителя
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
    
    // Обновляем проигравшего
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

// === КОМАНДА /start (ГЛАВНАЯ ЛОГИКА) ===
bot.command('start', async (ctx) => {
    const payload = ctx.match; // текст после /start
    const userId = ctx.from.id.toString();
    const firstName = ctx.from.first_name || '';
    
    // === 1. СОЗДАНИЕ КОМНАТЫ ===
    if (payload === 'create_room') {
        const roomId = `room_${Date.now()}_${userId}`;
        
        const { error } = await supabase
            .from('rooms')
            .insert([{
                id: roomId,
                creator_id: userId,
                bet_amount: 0.1,
                status: 'waiting'
            }]);
        
        if (error) {
            console.error('Ошибка создания комнаты:', error);
            await ctx.reply('❌ Не удалось создать комнату. Попробуйте позже.');
            return;
        }
        
        await ctx.reply(
            `✅ **КОМНАТА СОЗДАНА!**\n\n` +
            `🎲 Код комнаты: \`${roomId}\`\n` +
            `💰 Ставка: 0.1 TON\n\n` +
            `🔗 **Отправь другу ссылку:**\n` +
            `https://t.me/${bot.botInfo.username}?start=join_${roomId}\n\n` +
            `⚔️ После того как друг перейдёт по ссылке, оба нажмите кнопку "PLAY" и выберите жест!`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // === 2. ПРИСОЕДИНЕНИЕ К КОМНАТЕ ===
    if (payload && payload.startsWith('join_')) {
        const roomId = payload.substring(5);
        
        const { data: room, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .single();
        
        if (error || !room) {
            await ctx.reply('❌ Комната не найдена. Проверьте код или создайте новую комнату.');
            return;
        }
        
        if (room.status !== 'waiting') {
            await ctx.reply('❌ Комната уже занята. Игра началась или уже завершена.');
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
        
        await ctx.reply(
            `✅ **ВЫ ПРИСОЕДИНИЛИСЬ К КОМНАТЕ!**\n\n` +
            `💰 Ставка: ${room.bet_amount} TON\n\n` +
            `⚔️ Игра началась! Нажмите кнопку "PLAY" и выберите жест!`
        );
        
        await bot.api.sendMessage(
            room.creator_id,
            `🎮 **СОПЕРНИК ПРИСОЕДИНИЛСЯ!**\n\n⚔️ Игра началась! Нажмите кнопку "PLAY" и выберите жест!`
        );
        return;
    }
    
    // === 3. ВЫБОР ЖЕСТА ===
    if (payload && payload.startsWith('choice_')) {
        const parts = payload.split('_');
        // формат: choice_room_123456789_0.1_choice
        // или choice_room_123456789_rock
        let roomId, choice;
        
        if (parts.length === 5 && parts[4] === 'choice') {
            // старый формат, игнорируем
            await ctx.reply('❌ Неверный формат. Используйте кнопку "PLAY" для выбора жеста.');
            return;
        } else if (parts.length === 4) {
            roomId = `${parts[1]}_${parts[2]}_${parts[3]}`;
            choice = parts[4] || parts[3];
        } else if (parts.length === 3) {
            roomId = `${parts[1]}`;
            choice = parts[2];
        } else {
            roomId = payload.substring(7);
            const lastUnderscore = roomId.lastIndexOf('_');
            if (lastUnderscore !== -1) {
                choice = roomId.substring(lastUnderscore + 1);
                roomId = roomId.substring(0, lastUnderscore);
            } else {
                await ctx.reply('❌ Неверный формат выбора жеста.');
                return;
            }
        }
        
        // Нормализуем choice
        if (!['rock', 'paper', 'scissors'].includes(choice)) {
            await ctx.reply('❌ Неверный жест. Используйте камень, ножницы или бумагу.');
            return;
        }
        
        // Получаем комнату
        const { data: room, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .single();
        
        if (error || !room) {
            await ctx.reply('❌ Комната не найдена.');
            return;
        }
        
        if (room.status !== 'playing') {
            await ctx.reply('❌ Игра уже завершена.');
            return;
        }
        
        const isCreator = (room.creator_id === userId);
        const updateField = isCreator ? 'creator_choice' : 'opponent_choice';
        
        // Сохраняем выбор
        await supabase
            .from('rooms')
            .update({ [updateField]: choice })
            .eq('id', room.id);
        
        await ctx.reply(`✅ Вы выбрали: ${getChoiceName(choice)}. Ожидаем выбора соперника...`);
        
        // Проверяем, оба ли сделали выбор
        const { data: updatedRoom } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', room.id)
            .single();
        
        if (updatedRoom.creator_choice && updatedRoom.opponent_choice) {
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
            
            await bot.api.sendMessage(updatedRoom.creator_id, `🏆 ${result.text}`);
            if (updatedRoom.opponent_id) {
                await bot.api.sendMessage(updatedRoom.opponent_id, `🏆 ${result.text}`);
            }
        }
        return;
    }
    
    // === 4. ОБЫЧНАЯ РЕГИСТРАЦИЯ /start ===
    const username = ctx.from.username || 'без_имени';
    
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