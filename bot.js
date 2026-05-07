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
            .eq('id', roomId);

        await ctx.reply(
            `🎮 Вы присоединились!\nСтавка: ${room.bet_amount} TON\nВыберите жест в мини-приложении:`,
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
            `🎮 Соперник присоединился! Выберите жест в мини-приложении:`,
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
                `🦔 Привет, ${firstName}!\nАккаунт создан.\nНажми на кнопку, чтобы войти в игру.`,
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
                `🦔 С возвращением, ${firstName}!\nНажми на кнопку, чтобы продолжить.`,
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
        `✅ Комната создана!\nСтавка: ${bet} TON\nСсылка для соперника:\nhttps://t.me/EkhidnaNaklzBot?start=${roomId}`
    );
});

// === ВРЕМЕННЫЙ ТЕСТОВЫЙ ОБРАБОТЧИК (ПРОСТОЕ ЭХО) ===
bot.on('message:web_app_data', async (ctx) => {
    const data = ctx.webAppData.data;
    console.log(`📩 Тест: получено ${data} от ${ctx.from.id}`);
    await ctx.reply(`✅ Бот получил: ${data}`);
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