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

        console.log(`Статус комнаты: ${room.status}, создатель: ${room.creator_id}, соперник: ${room.opponent_id || 'нет'}`);

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

        await ctx.reply(
            `🎮 Вы присоединились к комнате!\n\nСтавка: ${room.bet_amount} TON\n\nИгра началась! Используйте команду /game, чтобы выбрать жест.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎮 ИГРАТЬ', web_app: { url: 'https://reliable-kringle-83dc61.netlify.app/' } }]
                    ]
                }
            }
        );

        await bot.api.sendMessage(
            room.creator_id,
            `🎮 Соперник присоединился!\n\nИспользуйте команду /game, чтобы выбрать жест.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎮 ИГРАТЬ', web_app: { url: 'https://reliable-kringle-83dc61.netlify.app/' } }]
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

// === ДИАГНОСТИЧЕСКАЯ КОМАНДА /check ===
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
        message += `ID: ${room.id}\n`;
        message += `Статус: ${room.status}\n`;
        message += `Создатель: ${room.creator_id === userId ? 'вы' : room.creator_id}\n`;
        message += `Соперник: ${room.opponent_id === userId ? 'вы' : (room.opponent_id || 'нет')}\n`;
        message += `Ваш выбор: ${room.creator_id === userId ? (room.creator_choice || 'нет') : (room.opponent_choice || 'нет')}\n`;
        message += `---\n`;
    }
    
    await ctx.reply(message);
});

// === ДИАГНОСТИЧЕСКАЯ ВЕРСИЯ /game (ПРОСТО ПОКАЗЫВАЕТ КОМНАТЫ) ===
bot.command('game', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    // Просто проверяем, есть ли комнаты
    const { data: rooms, error } = await supabase
        .from('rooms')
        .select('id, status, creator_id, opponent_id')
        .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`);
    
    if (error) {
        await ctx.reply(`❌ Ошибка БД: ${error.message}`);
        return;
    }
    
    if (!rooms || rooms.length === 0) {
        await ctx.reply('❌ Нет комнат. Создайте через /create_room');
        return;
    }
    
    // Показываем список комнат
    let msg = '📋 Ваши комнаты:\n\n';
    for (const room of rooms) {
        msg += `ID: ${room.id}\n`;
        msg += `Статус: ${room.status}\n`;
        msg += `Создатель: ${room.creator_id === userId ? 'вы' : 'другой'}\n`;
        msg += `Соперник: ${room.opponent_id ? (room.opponent_id === userId ? 'вы' : 'есть') : 'нет'}\n`;
        msg += `---\n`;
    }
    await ctx.reply(msg);
});

// === ВЕБ-СЕРВЕР ДЛЯ RENDER ===
const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('🦔 Бот Ехидны Наклз работает');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Веб-сервер на порту ${port}`);
});

// === ЗАПУСК БОТА ===
console.log('🦔 Бот Ехидны Наклз запускается...');

bot.start()
    .then(() => {
        console.log('✅ Бот успешно запущен!');
    })
    .catch((err) => {
        console.error('❌ Ошибка запуска:', err);
    });