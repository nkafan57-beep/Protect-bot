const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server is running.'));

const token = process.env.TOKEN;
const clientId = '1404935833173229589';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    presence: {
        status: 'online',
        activities: [{ name: 'حماية السيرفر', type: 3 }]
    }
});

// تخزين حالة الحماية القسوى لكل سيرفر
const strictProtectionMap = new Map();

// لتخزين رتب البوت مؤقتاً قبل سحبها
const botsRolesCache = new Map();

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // تسجيل أوامر سلاش
    const commands = [
        new SlashCommandBuilder()
            .setName('strictprotection')
            .setDescription('تفعيل أو تعطيل الحماية القسوى للبوتات')
            .addBooleanOption(option => option.setName('enable').setDescription('تشغيل أو إيقاف').setRequired(true))
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        console.log('⏳ Registering slash commands globally...');
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );
        console.log('✅ Slash commands registered globally!');
    } catch (error) {
        console.error(error);
    }
});

client.on('guildMemberAdd', async (member) => {
    try {
        // إذا العضو الجديد بوت
        if (!member.user.bot) return;

        // تحقق من حالة الحماية القسوى للسيرفر
        const isStrict = strictProtectionMap.get(member.guild.id);
        if (!isStrict) return; // لو النظام مغلق ما نسوي شي

        // مش ناظر ولا روم ولا صلاحية، نسحب رتب البوت كلها
        // قبل السحب، خزّن رتب البوت عشان ترجعها لو وافق صاحب السيرفر
        botsRolesCache.set(member.id, member.roles.cache.map(r => r.id));

        // اسحب كل الرتب (إلا @everyone لأن ما تنشال)
        await member.roles.set([]);

        // رسالة لصاحب السيرفر
        const owner = await member.guild.fetchOwner();
        if (!owner) return;

        // نرسل رسالة خاصة لصاحب السيرفر يختار يسمح أو لا (هنا بيساعدنا رد بـ buttons لو حبينا تطوير)

        await owner.send({
            content: `🚨 بوت جديد دخل سيرفرك: ${member.user.tag}\nهل تسمح له باستعادة رتبته وصلاحياته؟\n` +
                `اكتب **!allow ${member.id}** للسماح أو **!deny ${member.id}** للرفض.`
        });

    } catch (error) {
        console.error('Error handling new bot join:', error);
    }
});

client.on('messageCreate', async (message) => {
    // أوامر خاصة بصاحب السيرفر للرد على السماح أو الرفض
    if (!message.guild) return; // بس بالسيرفر
    if (message.author.id !== message.guild.ownerId) return; // بس لصاحب السيرفر

    const content = message.content.trim();
    if (content.startsWith('!allow ')) {
        const botId = content.split(' ')[1];
        const botMember = await message.guild.members.fetch(botId).catch(() => null);
        if (!botMember) return message.reply('🚫 البوت غير موجود بالسيرفر.');

        const cachedRoles = botsRolesCache.get(botId);
        if (!cachedRoles) return message.reply('🚫 ما في رتب محفوظة له.');

        // رجع الرتب
        await botMember.roles.set(cachedRoles).catch(e => message.reply(`❌ فشل بإرجاع الرتب: ${e.message}`));
        botsRolesCache.delete(botId);
        return message.reply(`✅ تم السماح للبوت ${botMember.user.tag} باستعادة رتبته.`);
    } else if (content.startsWith('!deny ')) {
        const botId = content.split(' ')[1];
        const botMember = await message.guild.members.fetch(botId).catch(() => null);
        if (!botMember) return message.reply('🚫 البوت غير موجود بالسيرفر.');

        // ما نعطيه شي ونحذف الرتب المحفوظة
        botsRolesCache.delete(botId);
        return message.reply(`✅ تم رفض دخول البوت ${botMember.user.tag} بصلاحيات.`);
    }
});

// أمر سلاش تفعيل/تعطيل الحماية القسوى
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'strictprotection') {
        const enable = interaction.options.getBoolean('enable');
        // بس صاحب السيرفر أو عنده صلاحيات ادارية
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ ما عندك صلاحية تستخدم هذا الأمر.', ephemeral: true });
        }

        strictProtectionMap.set(interaction.guild.id, enable);

        return interaction.reply({ content: `✅ الحماية القسوى للبوتات الآن ${enable ? 'مفعلة' : 'معطلة'}.`, ephemeral: true });
    }
});

client.login(token);
