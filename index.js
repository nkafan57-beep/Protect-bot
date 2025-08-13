
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AuditLogEvent } = require('discord.js');
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server is running.'));

const token = process.env.TOKEN;
const clientId = '1392084340145524757';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildAuditLog,
    ],
    presence: {
        status: 'online',
        activities: [{ name: 'حماية السيرفر', type: 3 }]
    }
});

// تخزين حالة الحماية القسوى لكل سيرفر
const strictProtectionMap = new Map();

// تخزين حالة البان التلقائي لكل سيرفر
const autoBanMap = new Map();

// تخزين حالة تصفية الشتائم لكل سيرفر
const profanityFilterMap = new Map();

// تخزين أنظمة السجلات لكل سيرفر
const loggingChannelsMap = new Map();

// لتخزين رتب البوت مؤقتاً قبل سحبها
const botsRolesCache = new Map();

// تخزين التحذيرات
const warningsMap = new Map();

// تخزين الرسائل المحذوفة مؤقتاً للسجلات
const deletedMessagesCache = new Map();

// قائمة الشتائم والكلمات المحظورة
const profanityWords = [
    'زبي', 'كس', 'كس امك', 'اير', 'ايري', 'خرا', 'زب', 'كسمك', 'ايرك', 'منيوك',
    'عاهرة', 'شرموطة', 'قحبة', 'بنت شرموطة', 'ابن قحبة', 'ابن كلب', 'كلب',
    'حمار', 'تيس', 'خنزير', 'نيك', 'منيك', 'متناك', 'fuck', 'shit', 'bitch',
    'ass', 'damn', 'pussy', 'dick', 'cock', 'whore', 'slut'
];

// دالة لتنظيف النص وإزالة الأحرف المشوشة
function cleanText(text) {
    return text
        .toLowerCase()
        .replace(/[^\u0600-\u06FFa-z0-9\s]/g, '') // إزالة الرموز والأحرف المشوشة
        .replace(/(.)\1+/g, '$1') // إزالة الأحرف المكررة
        .replace(/\s+/g, ' ') // توحيد المسافات
        .trim();
}

// دالة للتحقق من وجود شتائم
function containsProfanity(text) {
    const cleanedText = cleanText(text);
    
    return profanityWords.some(word => {
        const cleanedWord = cleanText(word);
        
        // البحث المباشر
        if (cleanedText.includes(cleanedWord)) {
            return true;
        }
        
        // البحث مع تجاهل المسافات والرموز
        const textWithoutSpaces = cleanedText.replace(/\s/g, '');
        const wordWithoutSpaces = cleanedWord.replace(/\s/g, '');
        
        if (textWithoutSpaces.includes(wordWithoutSpaces)) {
            return true;
        }
        
        // البحث مع تجاهل الأحرف المفردة بين الأحرف
        const regex = new RegExp(wordWithoutSpaces.split('').join('.*?'), 'i');
        if (regex.test(textWithoutSpaces)) {
            return true;
        }
        
        return false;
    });
}

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // تسجيل أوامر سلاش
    const commands = [
        new SlashCommandBuilder()
            .setName('strictprotection')
            .setDescription('تفعيل أو تعطيل الحماية القسوى للبوتات')
            .addBooleanOption(option => option.setName('enable').setDescription('تشغيل أو إيقاف').setRequired(true)),
        
        new SlashCommandBuilder()
            .setName('autoban')
            .setDescription('تفعيل أو تعطيل البان التلقائي للبوتات')
            .addBooleanOption(option => option.setName('enable').setDescription('تشغيل أو إيقاف').setRequired(true)),
            
        new SlashCommandBuilder()
            .setName('profanityfilter')
            .setDescription('تفعيل أو تعطيل تصفية الشتائم')
            .addBooleanOption(option => option.setName('enable').setDescription('تشغيل أو إيقاف').setRequired(true)),
            
        new SlashCommandBuilder()
            .setName('setlogchannel')
            .setDescription('تعيين قناة السجلات')
            .addChannelOption(option => option.setName('channel').setDescription('قناة السجلات').setRequired(true)),
            
        new SlashCommandBuilder()
            .setName('warn')
            .setDescription('تحذير عضو')
            .addUserOption(option => option.setName('user').setDescription('العضو المراد تحذيره').setRequired(true))
            .addStringOption(option => option.setName('reason').setDescription('سبب التحذير').setRequired(true)),
            
        new SlashCommandBuilder()
            .setName('warnings')
            .setDescription('عرض تحذيرات عضو')
            .addUserOption(option => option.setName('user').setDescription('العضو المراد عرض تحذيراته').setRequired(true)),
            
        new SlashCommandBuilder()
            .setName('timeout')
            .setDescription('إعطاء مهلة زمنية لعضو')
            .addUserOption(option => option.setName('user').setDescription('العضو المراد إعطاؤه مهلة').setRequired(true))
            .addIntegerOption(option => option.setName('duration').setDescription('المدة بالدقائق').setRequired(true))
            .addStringOption(option => option.setName('reason').setDescription('السبب').setRequired(false)),
            
        new SlashCommandBuilder()
            .setName('addrole')
            .setDescription('إعطاء رتبة لعضو')
            .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
            .addRoleOption(option => option.setName('role').setDescription('الرتبة').setRequired(true)),
            
        new SlashCommandBuilder()
            .setName('removerole')
            .setDescription('إزالة رتبة من عضو')
            .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
            .addRoleOption(option => option.setName('role').setDescription('الرتبة').setRequired(true))
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
        console.error('Error registering commands:', error);
    }
});

// مراقبة الرسائل للتحقق من الشتائم
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const isProfanityEnabled = profanityFilterMap.get(message.guild.id);
    if (!isProfanityEnabled) return;
    
    if (containsProfanity(message.content)) {
        try {
            // حذف الرسالة
            await message.delete();
            
            // إعطاء تايم أوت 10 دقائق
            await message.member.timeout(10 * 60 * 1000, 'استخدام ألفاظ غير لائقة');
            
            // إرسال رسالة خاصة للعضو
            try {
                await message.author.send(`🚫 **تم حظرك مؤقتاً**\n\nتم حظرك لمدة 10 دقائق من سيرفر **${message.guild.name}** بسبب استخدام ألفاظ غير لائقة.\n\nالرسالة المحذوفة: \`${message.content}\`\n\nيرجى الالتزام بقوانين السيرفر.`);
            } catch (e) {
                console.log('Could not send DM to user');
            }
            
            // تسجيل في قناة السجلات
            const logChannel = loggingChannelsMap.get(message.guild.id);
            if (logChannel) {
                const channel = message.guild.channels.cache.get(logChannel);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('🚫 تم حذف رسالة تحتوي على شتائم')
                        .addFields(
                            { name: 'العضو', value: `${message.author} (${message.author.tag})`, inline: true },
                            { name: 'القناة', value: `${message.channel}`, inline: true },
                            { name: 'الرسالة', value: `\`${message.content}\``, inline: false },
                            { name: 'الإجراء', value: 'تايم أوت 10 دقائق', inline: true }
                        )
                        .setTimestamp();
                    
                    await channel.send({ embeds: [embed] });
                }
            }
            
        } catch (error) {
            console.error('Error handling profanity:', error);
        }
    }
});

// معالجة الأوامر الكتابية
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).split(' ');
    const command = args.shift().toLowerCase();
    
    // أمر التحذير الكتابي
    if (command === 'w' || command === 'warn') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply('❌ ليس لديك صلاحية لاستخدام هذا الأمر.');
        }
        
        const target = message.mentions.users.first();
        if (!target) {
            return message.reply('❌ يجب عليك منشن العضو المراد تحذيره.');
        }
        
        const reason = args.slice(1).join(' ') || 'لا يوجد سبب محدد';
        
        // إضافة التحذير
        const guildWarnings = warningsMap.get(message.guild.id) || new Map();
        const userWarnings = guildWarnings.get(target.id) || [];
        
        userWarnings.push({
            reason: reason,
            moderator: message.author.tag,
            date: new Date(),
            id: Date.now()
        });
        
        guildWarnings.set(target.id, userWarnings);
        warningsMap.set(message.guild.id, guildWarnings);
        
        await message.reply(`⚠️ تم تحذير ${target.tag} بنجاح.\nالسبب: ${reason}\nعدد التحذيرات: ${userWarnings.length}`);
        
        // تسجيل في السجلات
        const logChannel = loggingChannelsMap.get(message.guild.id);
        if (logChannel) {
            const channel = message.guild.channels.cache.get(logChannel);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setColor('#ffff00')
                    .setTitle('⚠️ تحذير جديد')
                    .addFields(
                        { name: 'المحذِر', value: `${message.author} (${message.author.tag})`, inline: true },
                        { name: 'المحذَر', value: `${target} (${target.tag})`, inline: true },
                        { name: 'السبب', value: reason, inline: false },
                        { name: 'عدد التحذيرات', value: `${userWarnings.length}`, inline: true }
                    )
                    .setTimestamp();
                
                await channel.send({ embeds: [embed] });
            }
        }
    }
    
    // أمر التايم أوت الكتابي
    if (command === 'timeout' || command === 'mute') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply('❌ ليس لديك صلاحية لاستخدام هذا الأمر.');
        }
        
        const target = message.mentions.members.first();
        if (!target) {
            return message.reply('❌ يجب عليك منشن العضو المراد إعطاؤه تايم أوت.');
        }
        
        const duration = parseInt(args[1]);
        if (!duration || duration <= 0) {
            return message.reply('❌ يجب تحديد مدة صحيحة بالدقائق.');
        }
        
        const reason = args.slice(2).join(' ') || 'لا يوجد سبب محدد';
        
        try {
            await target.timeout(duration * 60 * 1000, reason);
            await message.reply(`🔇 تم إعطاء ${target.user.tag} تايم أوت لمدة ${duration} دقيقة.\nالسبب: ${reason}`);
        } catch (error) {
            await message.reply('❌ فشل في إعطاء التايم أوت.');
        }
    }
    
    // أمر إعطاء الرتبة الكتابي
    if (command === 'addrole') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('❌ ليس لديك صلاحية لإدارة الرتب.');
        }
        
        const target = message.mentions.members.first();
        const role = message.mentions.roles.first();
        
        if (!target || !role) {
            return message.reply('❌ يجب منشن العضو والرتبة.');
        }
        
        try {
            await target.roles.add(role);
            await message.reply(`✅ تم إعطاء رتبة ${role.name} للعضو ${target.user.tag}`);
        } catch (error) {
            await message.reply('❌ فشل في إعطاء الرتبة.');
        }
    }
    
    // أمر إزالة الرتبة الكتابي
    if (command === 'removerole') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('❌ ليس لديك صلاحية لإدارة الرتب.');
        }
        
        const target = message.mentions.members.first();
        const role = message.mentions.roles.first();
        
        if (!target || !role) {
            return message.reply('❌ يجب منشن العضو والرتبة.');
        }
        
        try {
            await target.roles.remove(role);
            await message.reply(`✅ تم إزالة رتبة ${role.name} من العضو ${target.user.tag}`);
        } catch (error) {
            await message.reply('❌ فشل في إزالة الرتبة.');
        }
    }
});

// مراقبة حذف الرسائل
client.on('messageDelete', async (message) => {
    if (message.author?.bot) return;
    
    // حفظ الرسالة المحذوفة مؤقتاً
    deletedMessagesCache.set(message.id, {
        content: message.content,
        author: message.author,
        channel: message.channel,
        createdAt: message.createdAt,
        deletedAt: new Date()
    });
    
    const logChannel = loggingChannelsMap.get(message.guild.id);
    if (!logChannel) return;
    
    const channel = message.guild.channels.cache.get(logChannel);
    if (!channel) return;
    
    // البحث عن من حذف الرسالة
    try {
        const auditLogs = await message.guild.fetchAuditLogs({
            type: AuditLogEvent.MessageDelete,
            limit: 1
        });
        
        const deleteLog = auditLogs.entries.first();
        let deleter = 'غير معروف';
        
        if (deleteLog && deleteLog.target.id === message.author?.id && deleteLog.createdAt > Date.now() - 5000) {
            deleter = deleteLog.executor.tag;
        }
        
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('🗑️ رسالة محذوفة')
            .addFields(
                { name: 'صاحب الرسالة', value: `${message.author} (${message.author?.tag})`, inline: true },
                { name: 'القناة', value: `${message.channel}`, inline: true },
                { name: 'حُذفت بواسطة', value: deleter, inline: true },
                { name: 'المحتوى', value: message.content || 'رسالة فارغة', inline: false },
                { name: 'تاريخ الإرسال', value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`, inline: true }
            )
            .setTimestamp();
        
        const sentMessage = await channel.send({ embeds: [embed] });
        
        // مراقبة حذف رسالة السجل
        const collector = sentMessage.createMessageComponentCollector({ time: 300000 });
        
        setTimeout(async () => {
            try {
                const messageExists = await channel.messages.fetch(sentMessage.id);
                if (!messageExists) {
                    // الرسالة محذوفة، إعادة إرسالها
                    const newEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('🚨 محاولة حذف سجل')
                        .setDescription('تم محاولة حذف رسالة من السجل وتم استعادتها')
                        .addFields(
                            { name: 'صاحب الرسالة الأصلية', value: `${message.author} (${message.author?.tag})`, inline: true },
                            { name: 'القناة', value: `${message.channel}`, inline: true },
                            { name: 'المحتوى المحذوف', value: message.content || 'رسالة فارغة', inline: false }
                        )
                        .setTimestamp();
                    
                    await channel.send({ embeds: [newEmbed] });
                    
                    // إشعار صاحب السيرفر
                    const owner = await message.guild.fetchOwner();
                    if (owner) {
                        await owner.send(`🚨 **محاولة حذف من السجل**\n\nتم حذف رسالة سجل في سيرفر **${message.guild.name}**\nالقناة: ${channel}\n\nتم استعادة المعلومات.`);
                    }
                }
            } catch (e) {
                // الرسالة محذوفة
                const newEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('🚨 محاولة حذف سجل')
                    .setDescription('تم محاولة حذف رسالة من السجل وتم استعادتها')
                    .addFields(
                        { name: 'صاحب الرسالة الأصلية', value: `${message.author} (${message.author?.tag})`, inline: true },
                        { name: 'القناة', value: `${message.channel}`, inline: true },
                        { name: 'المحتوى المحذوف', value: message.content || 'رسالة فارغة', inline: false }
                    )
                    .setTimestamp();
                
                await channel.send({ embeds: [newEmbed] });
                
                // إشعار صاحب السيرفر
                const owner = await message.guild.fetchOwner();
                if (owner) {
                    await owner.send(`🚨 **محاولة حذف من السجل**\n\nتم حذف رسالة سجل في سيرفر **${message.guild.name}**\nالقناة: ${channel}\n\nتم استعادة المعلومات.`);
                }
            }
        }, 5000);
        
    } catch (error) {
        console.error('Error logging deleted message:', error);
    }
});

// مراقبة التايم أوت
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (oldMember.communicationDisabledUntil === newMember.communicationDisabledUntil) return;
    
    const logChannel = loggingChannelsMap.get(newMember.guild.id);
    if (!logChannel) return;
    
    const channel = newMember.guild.channels.cache.get(logChannel);
    if (!channel) return;
    
    try {
        const auditLogs = await newMember.guild.fetchAuditLogs({
            type: AuditLogEvent.MemberUpdate,
            limit: 1
        });
        
        const timeoutLog = auditLogs.entries.first();
        let moderator = 'غير معروف';
        let reason = 'لا يوجد سبب';
        
        if (timeoutLog && timeoutLog.target.id === newMember.id && timeoutLog.createdAt > Date.now() - 5000) {
            moderator = timeoutLog.executor.tag;
            reason = timeoutLog.reason || 'لا يوجد سبب';
        }
        
        if (newMember.communicationDisabledUntil) {
            // تم إعطاء تايم أوت
            const embed = new EmbedBuilder()
                .setColor('#ff6600')
                .setTitle('🔇 تايم أوت')
                .addFields(
                    { name: 'المشرف', value: moderator, inline: true },
                    { name: 'العضو', value: `${newMember.user} (${newMember.user.tag})`, inline: true },
                    { name: 'السبب', value: reason, inline: false },
                    { name: 'ينتهي في', value: `<t:${Math.floor(newMember.communicationDisabledUntil.getTime() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();
            
            await channel.send({ embeds: [embed] });
        } else {
            // تم إلغاء التايم أوت
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🔊 إلغاء التايم أوت')
                .addFields(
                    { name: 'المشرف', value: moderator, inline: true },
                    { name: 'العضو', value: `${newMember.user} (${newMember.user.tag})`, inline: true }
                )
                .setTimestamp();
            
            await channel.send({ embeds: [embed] });
        }
        
    } catch (error) {
        console.error('Error logging timeout:', error);
    }
});

// مراقبة إعطاء وإزالة الرتب
client.on('guildMemberUpdate', async (oldMember, newMember) =
