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

async function determineWinner(choice1, choice2, creatorId, opponentId) {
    if (choice1 === choice2) return { text: `🤝 НИЧЬЯ!`, winnerId: null };
    const winMap = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
    if (winMap[choice1] === choice2) {
        return { text: `🥇 ПОБЕДИЛ СОЗДАТЕЛЬ КОМНАТЫ!\n${getChoiceName(choice1)} побеждает ${getChoiceName(choice2)}`, winnerId: creatorId };
    }
    return { text: `🥇 ПОБЕДИЛ СОПЕРНИК!\n${getChoiceName(choice2)} побеждает ${getChoiceName(choice1)}`, winnerId: opponentId };
}

// === ГЛАВНАЯ КОМАНДА /start ===
bot.command('start', async (ctx) => {
    const payload = ctx.match;
    const userId = ctx.from.id.toString();
    const firstName = ctx.from.first_name || '';

    // --- СОЗДАНИЕ КОМНАТЫ ---
    if (payload === 'create_room') {
        const roomId = `room_${Date.now()}_${userId}`;
        await supabase.from('rooms').insert([{ id: roomId, creator_id: userId, bet_amount: 0.1, status: 'waiting' }]);
        await ctx.reply(
            `✅ **КОМНАТА СОЗДАНА!**\n\n` +
            `🎲 Код: \`${roomId}\`\n\n` +
            `🔗 Отправь другу ссылку:\n` +
            `https://t.me/${bot.botInfo.username}?start=room_${roomId}\n\n` +
            `⚔️ Когда друг перейдёт по ссылке, выберите жест в чате!`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // --- ПРИСОЕДИНЕНИЕ К КОМНАТЕ ---
    if (payload && payload.startsWith('join_')) {
        const roomId = payload.substring(5);
        const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
        if (!room || room.status !== 'waiting') {
            await ctx.reply('❌ Комната не найдена или уже занята.');
            return;
        }
        await supabase.from('rooms').update({ opponent_id: userId, status: 'playing' }).eq('id', room.id);
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

    // --- ВХОД ПО ССЫЛКЕ room_xxx ---
    if (payload && payload.startsWith('room_')) {
        const roomId = payload;
        const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
        if (!room) {
            await ctx.reply('❌ Комната не найдена.');
            return;
        }
        if (room.creator_id === userId) {
            await ctx.reply(`✅ **ВЫ СОЗДАТЕЛЬ КОМНАТЫ**\n\nОжидайте соперника...`);
        } else if (room.status === 'waiting') {
            await supabase.from('rooms').update({ opponent_id: userId, status: 'playing' }).eq('id', room.id);
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
        } else {
            await ctx.reply('❌ Комната уже занята.');
        }
        return;
    }

    // --- ОБЫЧНЫЙ СТАРТ (РЕГИСТРАЦИЯ) ---
    const { data: existing } = await supabase.from('users').select('id').eq('id', userId).single();
    if (!existing) {
        await supabase.from('users').insert([{ id: userId, username: ctx.from.username || 'anon', xp: 0, rank_level: 1, wins: 0, losses: 0, current_skin: 'Обычная Ехидна' }]);
        await ctx.reply(`🦔 **Привет, ${firstName}!**\n\nАккаунт создан!\n\nИспользуй команду /create_room, чтобы начать игру.`);
    } else {
        await ctx.reply(`🦔 **С возвращением, ${firstName}!**\n\nИспользуй команду /create_room, чтобы начать игру.`);
    }
});

// === ВЫБОР ЖЕСТА ===
bot.callbackQuery(/^choice_(.+)_(rock|paper|scissors)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const choice = ctx.match[2];
    const userId = ctx.from.id.toString();
    
    await ctx.answerCallbackQuery();
    
    const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (!room || room.status !== 'playing') {
        await ctx.reply('❌ Игра уже завершена.');
        return;
    }
    
    const isCreator = room.creator_id === userId;
    const field = isCreator ? 'creator_choice' : 'opponent_choice';
    
    await supabase.from('rooms').update({ [field]: choice }).eq('id', room.id);
    
    await ctx.editMessageText(`✅ Вы выбрали: ${getChoiceName(choice)}\n⏳ Ожидаем выбора соперника...`, { reply_markup: undefined });
    
    const { data: updated } = await supabase.from('rooms').select('*').eq('id', room.id).single();
    
    if (updated.creator_choice && updated.opponent_choice) {
        const result = await determineWinner(updated.creator_choice, updated.opponent_choice, updated.creator_id, updated.opponent_id);
        await supabase.from('rooms').update({ status: 'finished', winner_id: result.winnerId }).eq('id', room.id);
        
        if (result.winnerId) {
            const loserId = result.winnerId === updated.creator_id ? updated.opponent_id : updated.creator_id;
            await supabase.from('users').update({ wins: supabase.raw('wins + 1'), xp: supabase.raw('xp + 50') }).eq('id', result.winnerId);
            await supabase.from('users').update({ losses: supabase.raw('losses + 1'), xp: supabase.raw('xp + 10') }).eq('id', loserId);
        }
        
        await bot.api.sendMessage(updated.creator_id, `🏆 ${result.text}`);
        if (updated.opponent_id) await bot.api.sendMessage(updated.opponent_id, `🏆 ${result.text}`);
    }
});

// === КОМАНДА /profile ===
bot.command('profile', async (ctx) => {
    const userId = ctx.from.id.toString();
    const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
    if (!user) return ctx.reply('❌ Напишите /start сначала');
    ctx.reply(`🎩 **ПРОФИЛЬ**\n\nID: ${user.id}\n⭐ Ранг: ${user.rank_level}\n📊 XP: ${user.xp}\n🏆 Победы: ${user.wins} | Поражения: ${user.losses}`);
});

// === ВЕБ-СЕРВЕР ===
const app = express();
const port = process.env.PORT || 10000;
app.use(express.json());
app.get('/', (req, res) => res.send('Бот работает'));
app.post('/webhook', async (req, res) => {
    try {
        if (!bot.botInfo) await bot.init();
        await bot.handleUpdate(req.body);
        res.sendStatus(200);
    } catch (err) { res.sendStatus(500); }
});

async function start() {
    await bot.init();
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    await bot.api.setWebhook(`https://ekhidna-game-v1-0.onrender.com/webhook`);
    app.listen(port, () => console.log(`✅ Бот запущен на порту ${port}`));
}
start();