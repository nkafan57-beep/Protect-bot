
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

// لتخزين رتب البوت مؤقتاً قبل سحبها
const botsRolesCache = new Map();

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
        console.error('Error registering commands:', error);
    }
});

client.on('guildMemberAdd', async (member) => {
    try {
        // إذا العضو الجديد ليس بوت، لا نفعل شيء
        if (!member.user.bot) return;

        // تحقق من حالة البان التلقائي أولاً
        const isAutoBan = autoBanMap.get(member.guild.id);
        if (isAutoBan) {
            try {
                await member.ban({ reason: 'البان التلقائي للبوتات مفعل' });
                console.log(`🚫 Auto-banned bot ${member.user.tag} from ${member.guild.name}`);
                
                // إشعار صاحب السيرفر بالبان
                const owner = await member.guild.fetchOwner();
                if (owner) {
                    await owner.send(`🚫 **بان تلقائي للبوت**\n\nتم بان البوت: **${member.user.tag}** (${member.user.id})\nمن السيرفر: **${member.guild.name}**\n\nالسبب: البان التلقائي للبوتات مفعل.`);
                }
                return;
            } catch (error) {
                console.error(`Failed to ban bot ${member.user.tag}:`, error);
            }
        }

        // إذا البان التلقائي مغلق، تحقق من الحماية القسوى
        const isStrict = strictProtectionMap.get(member.guild.id);
        if (!isStrict) return;

        // حفظ رتب البوت قبل إزالتها (باستثناء @everyone)
        const botRoles = member.roles.cache.filter(role => role.id !== member.guild.id).map(r => r.id);
        if (botRoles.length > 0) {
            botsRolesCache.set(member.id, botRoles);
            // إزالة كل الرتب
            await member.roles.set([]);
        }

        // الحصول على صاحب السيرفر
        const owner = await member.guild.fetchOwner();
        if (!owner) return;

        // إنشاء الأزرار
        const allowButton = new ButtonBuilder()
            .setCustomId(`allow_${member.id}`)
            .setLabel('✅ السماح')
            .setStyle(ButtonStyle.Success);

        const denyButton = new ButtonBuilder()
            .setCustomId(`deny_${member.id}`)
            .setLabel('❌ الرفض')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder()
            .addComponents(allowButton, denyButton);

        // إرسال رسالة مباشرة لصاحب السيرفر مع الأزرار
        await owner.send({
            content: `🚨 **تحذير حماية البوتات**\n\nبوت جديد دخل سيرفرك: **${member.user.tag}** (${member.user.id})\nاسم السيرفر: **${member.guild.name}**\n\nتم إزالة جميع رتبه وصلاحياته مؤقتاً. هل تريد السماح له باستعادة رتبه؟`,
            components: [row]
        });

        console.log(`🛡️ Bot ${member.user.tag} joined ${member.guild.name} - roles removed and owner notified`);

    } catch (error) {
        console.error('Error handling new bot join:', error);
    }
});

// التعامل مع تفاعلات الأزرار
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            // أمر سلاش تفعيل/تعطيل الحماية القسوى
            if (interaction.commandName === 'strictprotection') {
                const enable = interaction.options.getBoolean('enable');
                
                // التحقق من الصلاحيات
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({ 
                        content: '❌ ما عندك صلاحية تستخدم هذا الأمر. تحتاج صلاحيات الإدارة.', 
                        ephemeral: true 
                    });
                }

                strictProtectionMap.set(interaction.guild.id, enable);

                return interaction.reply({ 
                    content: `✅ الحماية القسوى للبوتات الآن **${enable ? 'مفعلة' : 'معطلة'}** في هذا السيرفر.`, 
                    ephemeral: true 
                });
            }
            
            // أمر سلاش تفعيل/تعطيل البان التلقائي
            if (interaction.commandName === 'autoban') {
                const enable = interaction.options.getBoolean('enable');
                
                // التحقق من الصلاحيات
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({ 
                        content: '❌ ما عندك صلاحية تستخدم هذا الأمر. تحتاج صلاحيات الإدارة.', 
                        ephemeral: true 
                    });
                }

                // التحقق من صلاحية البان للبوت
                if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                    return interaction.reply({ 
                        content: '❌ البوت لا يملك صلاحية البان في هذا السيرفر.', 
                        ephemeral: true 
                    });
                }

                autoBanMap.set(interaction.guild.id, enable);

                return interaction.reply({ 
                    content: `${enable ? '🚫' : '✅'} البان التلقائي للبوتات الآن **${enable ? 'مفعل' : 'معطل'}** في هذا السيرفر.\n${enable ? '⚠️ تحذير: أي بوت يدخل السيرفر سيتم بانه تلقائياً!' : ''}`, 
                    ephemeral: true 
                });
            }
        }

        if (interaction.isButton()) {
            const [action, botId] = interaction.customId.split('_');
            
            if (action === 'allow' || action === 'deny') {
                // البحث عن السيرفر والبوت
                let botMember = null;
                let targetGuild = null;

                // البحث في جميع السيرفرات التي يتواجد فيها البوت
                for (const guild of client.guilds.cache.values()) {
                    if (guild.ownerId === interaction.user.id) {
                        try {
                            const member = await guild.members.fetch(botId);
                            if (member && member.user.bot) {
                                botMember = member;
                                targetGuild = guild;
                                break;
                            }
                        } catch (e) {
                            // البوت غير موجود في هذا السيرفر، ننتقل للتالي
                            continue;
                        }
                    }
                }

                if (!botMember || !targetGuild) {
                    return interaction.update({
                        content: '❌ البوت غير موجود أو تم إزالته من السيرفر.',
                        components: []
                    });
                }

                if (action === 'allow') {
                    const cachedRoles = botsRolesCache.get(botId);
                    
                    if (cachedRoles && cachedRoles.length > 0) {
                        try {
                            await botMember.roles.set(cachedRoles);
                            await interaction.update({
                                content: `✅ **تم السماح بنجاح!**\n\nالبوت: **${botMember.user.tag}**\nالسيرفر: **${targetGuild.name}**\n\nتم استعادة جميع رتبه وصلاحياته.`,
                                components: []
                            });
                        } catch (error) {
                            await interaction.update({
                                content: `❌ **فشل في استعادة الرتب**\n\nالبوت: **${botMember.user.tag}**\nالخطأ: ${error.message}`,
                                components: []
                            });
                        }
                    } else {
                        await interaction.update({
                            content: `✅ **تم السماح للبوت**\n\nالبوت: **${botMember.user.tag}**\nالسيرفر: **${targetGuild.name}**\n\n(لم تكن له رتب سابقة لاستعادتها)`,
                            components: []
                        });
                    }
                    
                    botsRolesCache.delete(botId);
                } else if (action === 'deny') {
                    // في حالة الرفض، نحذف الرتب المحفوظة
                    botsRolesCache.delete(botId);
                    
                    await interaction.update({
                        content: `❌ **تم رفض البوت**\n\nالبوت: **${botMember.user.tag}**\nالسيرفر: **${targetGuild.name}**\n\nلن يحصل على أي رتب أو صلاحيات.`,
                        components: []
                    });
                }

                console.log(`🔄 Owner ${interaction.user.tag} ${action}ed bot ${botMember.user.tag} in ${targetGuild.name}`);
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: '❌ حدث خطأ أثناء معالجة طلبك.', ephemeral: true });
            } catch (e) {
                console.error('Failed to send error message:', e);
            }
        }
    }
});

// إضافة معالج للأخطاء
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

client.login(token);
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
        console.error('Error registering commands:', error);
    }
});

client.on('guildMemberAdd', async (member) => {
    try {
        // إذا العضو الجديد ليس بوت، لا نفعل شيء
        if (!member.user.bot) return;

        // تحقق من حالة الحماية القسوى للسيرفر
        const isStrict = strictProtectionMap.get(member.guild.id);
        if (!isStrict) return; // لو النظام مغلق ما نسوي شي

        // حفظ رتب البوت قبل إزالتها (باستثناء @everyone)
        const botRoles = member.roles.cache.filter(role => role.id !== member.guild.id).map(r => r.id);
        if (botRoles.length > 0) {
            botsRolesCache.set(member.id, botRoles);
            // إزالة كل الرتب
            await member.roles.set([]);
        }

        // الحصول على صاحب السيرفر
        const owner = await member.guild.fetchOwner();
        if (!owner) return;

        // إنشاء الأزرار
        const allowButton = new ButtonBuilder()
            .setCustomId(`allow_${member.id}`)
            .setLabel('✅ السماح')
            .setStyle(ButtonStyle.Success);

        const denyButton = new ButtonBuilder()
            .setCustomId(`deny_${member.id}`)
            .setLabel('❌ الرفض')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder()
            .addComponents(allowButton, denyButton);

        // إرسال رسالة مباشرة لصاحب السيرفر مع الأزرار
        await owner.send({
            content: `🚨 **تحذير حماية البوتات**\n\nبوت جديد دخل سيرفرك: **${member.user.tag}** (${member.user.id})\nاسم السيرفر: **${member.guild.name}**\n\nتم إزالة جميع رتبه وصلاحياته مؤقتاً. هل تريد السماح له باستعادة رتبه؟`,
            components: [row]
        });

        console.log(`🛡️ Bot ${member.user.tag} joined ${member.guild.name} - roles removed and owner notified`);

    } catch (error) {
        console.error('Error handling new bot join:', error);
    }
});

// التعامل مع تفاعلات الأزرار
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            // أمر سلاش تفعيل/تعطيل الحماية القسوى
            if (interaction.commandName === 'strictprotection') {
                const enable = interaction.options.getBoolean('enable');
                
                // التحقق من الصلاحيات
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({ 
                        content: '❌ ما عندك صلاحية تستخدم هذا الأمر. تحتاج صلاحيات الإدارة.', 
                        ephemeral: true 
                    });
                }

                strictProtectionMap.set(interaction.guild.id, enable);

                return interaction.reply({ 
                    content: `✅ الحماية القسوى للبوتات الآن **${enable ? 'مفعلة' : 'معطلة'}** في هذا السيرفر.`, 
                    ephemeral: true 
                });
            }
        }

        if (interaction.isButton()) {
            const [action, botId] = interaction.customId.split('_');
            
            if (action === 'allow' || action === 'deny') {
                // البحث عن السيرفر والبوت
                let botMember = null;
                let targetGuild = null;

                // البحث في جميع السيرفرات التي يتواجد فيها البوت
                for (const guild of client.guilds.cache.values()) {
                    if (guild.ownerId === interaction.user.id) {
                        try {
                            const member = await guild.members.fetch(botId);
                            if (member && member.user.bot) {
                                botMember = member;
                                targetGuild = guild;
                                break;
                            }
                        } catch (e) {
                            // البوت غير موجود في هذا السيرفر، ننتقل للتالي
                            continue;
                        }
                    }
                }

                if (!botMember || !targetGuild) {
                    return interaction.update({
                        content: '❌ البوت غير موجود أو تم إزالته من السيرفر.',
                        components: []
                    });
                }

                if (action === 'allow') {
                    const cachedRoles = botsRolesCache.get(botId);
                    
                    if (cachedRoles && cachedRoles.length > 0) {
                        try {
                            await botMember.roles.set(cachedRoles);
                            await interaction.update({
                                content: `✅ **تم السماح بنجاح!**\n\nالبوت: **${botMember.user.tag}**\nالسيرفر: **${targetGuild.name}**\n\nتم استعادة جميع رتبه وصلاحياته.`,
                                components: []
                            });
                        } catch (error) {
                            await interaction.update({
                                content: `❌ **فشل في استعادة الرتب**\n\nالبوت: **${botMember.user.tag}**\nالخطأ: ${error.message}`,
                                components: []
                            });
                        }
                    } else {
                        await interaction.update({
                            content: `✅ **تم السماح للبوت**\n\nالبوت: **${botMember.user.tag}**\nالسيرفر: **${targetGuild.name}**\n\n(لم تكن له رتب سابقة لاستعادتها)`,
                            components: []
                        });
                    }
                    
                    botsRolesCache.delete(botId);
                } else if (action === 'deny') {
                    // في حالة الرفض، نحذف الرتب المحفوظة
                    botsRolesCache.delete(botId);
                    
                    await interaction.update({
                        content: `❌ **تم رفض البوت**\n\nالبوت: **${botMember.user.tag}**\nالسيرفر: **${targetGuild.name}**\n\nلن يحصل على أي رتب أو صلاحيات.`,
                        components: []
                    });
                }

                console.log(`🔄 Owner ${interaction.user.tag} ${action}ed bot ${botMember.user.tag} in ${targetGuild.name}`);
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: '❌ حدث خطأ أثناء معالجة طلبك.', ephemeral: true });
            } catch (e) {
                console.error('Failed to send error message:', e);
            }
        }
    }
});

// إضافة معالج للأخطاء
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

client.login(token);
