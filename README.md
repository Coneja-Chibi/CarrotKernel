# 🥕 CarrotKernel

> *A spiritual successor to old BunnyMoTags extension - Character consistency tracking system for SillyTavern*

[![Status: Active Development](https://img.shields.io/badge/Status-Active%20Development-orange.svg)](https://github.com/your-repo/CarrotKernel)
[![SillyTavern Extension](https://img.shields.io/badge/SillyTavern-Extension-blue.svg)](https://docs.sillytavern.app/)

## 🎭 What is CarrotKernel?

CarrotKernel is your AI's memory assistant - it automatically detects when you mention characters in conversation and seamlessly injects their personality data into the AI's context. Think of it as having a personal assistant who whispers character details to your AI exactly when they need them, ensuring consistent character portrayal across all your chats.

**The magic happens behind the scenes**: When you type "Alice seems upset today," CarrotKernel instantly recognizes Alice, pulls her personality traits from your lorebooks, and feeds that information to the AI. Your AI responds with perfect character consistency, and your chat stays clean without any visible clutter.

## 🚀 Core Features

### 🎯 **Smart Character Detection & Injection**
- **Automatic Recognition**: Detects character mentions in real-time as you type
- **Silent Injection**: Sends character data to AI context without cluttering your chat
- **Ephemeral Context**: Character data appears and disappears as needed - no permanent chat pollution
- **Depth Control**: Configurable injection priority (depth 4 = same as GuidedGenerations)

### 📚 **Dual Repository System**
- **👤 Character Repositories**: Lorebooks containing individual character data with `<BunnymoTags>` blocks
- **📖 Tag Libraries**: Lorebooks with tag definitions (species, personality types, etc.)
- **🔍 Smart Scanning**: Automatically identifies and categorizes your lorebooks
- **🎨 Visual Management**: Beautiful card-based interface for browsing characters, or seemless and native thinking blocks for a more immersive experience.

### 🧠 **Advanced Template System**
- **📝 Custom Templates**: Create your own injection prompts with macro variables
- **🔄 Template Categories**: Different formats for different use cases
- **👁️ Live Preview**: See how templates look with real character data
- **💾 Profile Management**: Save and apply template profiles per character or chat

### ⚙️ **Context-Aware Settings**
- **🌍 Global Settings**: Default configuration for all chats
- **👤 Character Settings**: Override settings for specific characters
- **💬 Chat Settings**: Unique configuration for individual conversations
- **🔄 Auto-Switching**: Settings automatically apply based on context

## 📖 How It Works

```
You type: "Alice walks into the room"
         ↓
CarrotKernel detects: "Alice"
         ↓
Finds Alice's data: <BunnymoTags><NAME:Alice>, <PERSONALITY:Tsundere>, <TRAIT:Shy></BunnymoTags>
         ↓
Injects to AI context: "Character Alice is tsundere and shy..."
         ↓
AI responds: *Alice's face flushes red as she looks away* "I-It's not like I wanted to see you or anything!"
```

## 🛠️ Installation & Setup

### Prerequisites
- SillyTavern (latest version recommended)
- Lorebooks containing character data in BunnymoTags format

## Step by Step Guide
### 1. Copy the gitlink for CarrotKernel and paste it in the ST extension adding bar. 
### 2. Run one of the three sheet based formats in the main BunnyMo file (!tagsheet, !quicksheet, !fullsheet) and then copy and paste the tag list at the bottom, pictured here. 

<img width="1140" height="252" alt="image" src="https://github.com/user-attachments/assets/5dec05b0-8d3d-42a2-bdb8-3a48ce49944b" />

   
### 3. Within the Main BunnyMo file (if you sort by UID) you will see the 'Spare Copies' section

<img width="1209" height="192" alt="image" src="https://github.com/user-attachments/assets/a8f38059-a209-42f1-9230-0e2360646781" />

### 4. Create a copy of the empty one labeled 'EMPTY Auto-Tag Injection - RENAME AND REKEY THIS TO WHATEVER CHARACTERS TAGS OR SHEET YOU ARE PUTTING IN.' In a new seperate lorebook that is for this chat. (You can also have all your character tags in one mega lorebook if you have a shared universe or something along those lines, the organization is really up to you)

Copy the tags you just lifted: <BunnymoTags><Name:Atsu_Ibn_Oba_Al-Masri>, <GENRE:FANTASY> <PHYSICAL> <SPECIES:HUMAN>, <GENDER:MALE>, <BUILD:Muscular>, <BUILD:Tall>, <SKIN:FAIR>, <HAIR:BLACK>, <STYLE:ANCIENT_EGYPTIAN_ROYALTY>,</PHYSICAL> <PERSONALITY><Dere:Sadodere>, <Dere:Oujidere>, <ENTJ-U>, <TRAIT:CRUEL>, <TRAIT:INTELLIGENT>, <TRAIT:POWERFUL>, <TRAIT:DANGEROUS>, <TRAIT:SELFISH>, <TRAIT:HEDONISTIC>, <ATTACHMENT:FEARFUL_AVOIDANT>, <CONFLICT:COMPETITIVE>, <BOUNDARIES:RIGID>,<FLIRTING:AGGRESSIVE>, </PERSONALITY> <NSFW><ORIENTATION:PANSEXUAL>, <POWER:DOMINANT>, <KINK:BRAT_TAMING>, <KINK:PUBLIC_HUMILIATION>, <KINK:POWER_PLAY>, <KINK:EXHIBITIONISM>, <CHEMISTRY:ANTAGONISTIC>, <AROUSAL:DOMINANCE>, <TRAUMA:CHILDHOOD>, <JEALOUSY:POSSESSIVE>,</NSFW> </BunnymoTags>

<Linguistics> Character uses <LING:COMMANDING> as his primary mode of speech, asserting authority and control. This is almost always blended with <LING:SUGGESTIVE>, using a tone of cruel flirtation, possessive pet names, and psychological manipulation to achieve his goals. </linguistics> ***INTO THAT EMPTY ENTRY, REPLACING WHAT IS INSIDE WITH IT, AND CHANGE THE TRIGGER KEYWORD TO THE MOST COMMONLY USED NAME(S) FOR SAID CHARACTER.) 

### 5. Then, declare the new lorebook you just made as a Character Repo within the Carrot Kernel settings and then scan the available lorebooks.

<img width="617" height="140" alt="image" src="https://github.com/user-attachments/assets/e6e4fe67-a03a-49ec-a1e8-1356c2d9d857" />

### 6. Profit!




## Basic Settings Rundown
1. **🔧 Enable Master Toggle**: Turn on CarrotKernel in Extension Settings
2. **📚 Select Lorebooks**: Choose which lorebooks contain your character data
3. **🔍 Scan Characters**: Click "Scan Selected Lorebooks" to build your repository
4. **✅ Test**: Mention a character in chat - their data should inject automatically!

## Power User Tools (Optional)
- **🎨 Display Mode**: Choose how character data appears (No Display recommended)
- **⚡ Injection Settings**: Fine-tune depth and character limits
- **📝 Templates**: Customize how character data is formatted for AI
- **🎯 Context Settings**: Create different profiles for different chats/characters

---

## 🎮 Specific Breakdowns

### 🏁 **Getting Started Tutorial**
CarrotKernel includes interactive tutorials! Click the status panels in Extension Settings:

- **🖥️ System Status**: Basic setup and configuration
- **📚 Character Repository**: Managing character data and lorebooks  
- **💉 AI Injection**: Understanding how the injection system works
- **📝 Template Manager**: Creating custom injection templates
- **📦 Pack Manager**: Installing and updating BunnyMo packs

### 📊 **The Dashboard**
Your CarrotKernel dashboard shows:

- **Characters Indexed**: How many characters are in your repository
- **Selected Lorebooks**: Which lorebooks you're currently using
- **Character Repositories**: How many lorebooks contain character data
- **System Status**: Real-time status of all CarrotKernel systems

### 🔍 **Character Discovery**
After scanning, you'll see character cards showing:
- **Character Names**: Who was found in your lorebooks
- **Tag Count**: How much data each character has
- **Source**: Which lorebook contains their data
- **Quick Preview**: Click any character to see their full profile


### 📋 **Organized Categories**
Character data gets automatically organized into:

- **💖 Personality & Traits**: MBTI types, dere types, core personality traits
- **👤 Physical Appearance**: Species, build, hair, style, gender identity  
- **💫 Relationships**: Attachment styles, family connections, romance preferences
- **⚙️ World & Setting**: Genre, setting, location, background context
- **🌱 Growth**: Psychology, social dynamics, development areas

## 🔧 Advanced Features

### 📝 **Template System**
Create custom injection prompts with powerful macro variables:

- `{{TRIGGERED_CHARACTER_TAGS}}` - All character data
- `{{CHARACTER_LIST}}` - Just character names
- `{{PERSONALITY_TAGS}}` - Only personality-related tags
- `{{PHYSICAL_TAGS}}` - Only appearance-related tags
- And more!
- Custom conditions and formatting

### ⚙️ **Context Management**
Configure CarrotKernel differently for different situations:

- **🌍 Global**: Default settings for all chats
- **👤 Per-Character**: Alice always uses medieval lorebooks
- **💬 Per-Chat**: This conversation uses sci-fi setting
- **🔄 Auto-Detection**: Settings switch automatically based on context

### 📊 **Pack Management System**
Install and manage BunnyMo content packs:
- **📦 Core Packs**: Essential personality and species definitions
- **🎨 Theme Packs**: Setting-specific content (medieval, sci-fi, etc.)
- **🔄 Auto-Updates**: Keep your content packs current
- **📋 Dependencies**: Automatic dependency management

## 💡 Pro Tips

### 🎯 **Optimal Settings**
- **Display Mode**: "Thinking Box Display" for most compact experience
- **Injection Depth**: 4 (matches GuidedGenerations standard)
- **Max Characters**: 6 (prevents context overload)

### 📚 **Lorebook Organization**
- **Separate by Type**: Keep character data and tag definitions in different lorebooks
- **Use Clear Names**: "Alice_Characters" vs "Personality_Definitions"
- **Regular Scanning**: Re-scan when you add new characters
- **Tag Consistency**: Use consistent tag naming across characters

### 🔍 **Troubleshooting**
- **No Injection?** Check that Master Enable is on and AI Injection is enabled
- **Wrong Characters?** Verify character names in lorebooks match exactly
- **Too Much Data?** Reduce Max Characters limit or use filtering
- **AI Confusion?** Try lower injection depth or different template

## 🎪 Display Modes

Choose how character data appears in your chats:

### 🚫 **No Display** 
- Completely silent injection
- Clean chat appearance  
- Maximum immersion
- AI gets data, you don't see it

### 💭 **Thinking Box Style** *(Recommended)*
- Character data appears in expandable boxes
- Visual confirmation of injection
- Can be manually expanded/collapsed
- Good for debugging

### 🎭 **Character Cards**
- Full visual character cards with tabs
- Organized by category (Personality, Physical, Growth)
- Beautiful presentation
- Interactive character browsing

## 🐛 Troubleshooting

### **Character not detected?**
- Verify exact name spelling in lorebook matches your chat
- Check that lorebook is selected and scanned
- Ensure `<NAME:>` tag is present in BunnymoTags block

### **No injection happening?**
- Confirm Master Enable toggle is ON
- Check AI Injection toggle is enabled  
- Verify character appears in repository after scanning
- Test with Debug Mode enabled to see console logs

### **Too much/little context?**
- Adjust Max Characters Displayed setting
- Modify Injection Depth (4 is recommended)
- Try different template with less/more detail
- Enable context filtering if needed

### **AI acting weird?**
- Lower injection depth to reduce priority
- Switch to simpler template
- Reduce max characters injected
- Check for conflicting character data

## 🎭 What Makes CarrotKernel Special?

### 🧠 **Built for Modern AI**
- Designed specifically for current AI capabilities
- Optimized injection timing and formatting
- Context-aware priority management
- Minimal performance impact

### 🎨 **Beautiful Interface**
- Glassmorphic design that matches SillyTavern
- Responsive layout that works on all devices
- Interactive tutorials with step-by-step guidance
- Real-time status monitoring

### 🔧 **Maximum Flexibility**
- Template system for complete customization
- Context-aware settings (global/character/chat)
- Multiple display modes
- Extensive configuration options

### 🚀 **Future-Proof Architecture**
- Modular design for easy expansion
- Plugin system for community additions
- Regular updates and improvements
- Built to evolve with AI technology

## 🤝 Community & Support

### 📢 **Getting Help**
- Check the built-in tutorials (click status panels)
- Enable Debug Mode for detailed logging
- Review character data format requirements
- Test with simple characters first

### 🐛 **Found a Bug?**
Help us improve CarrotKernel:
1. Enable Debug Mode
2. Reproduce the issue
3. Copy console logs
4. Report with steps to reproduce

### 💡 **Feature Requests**
CarrotKernel is actively developed. Suggestions welcome for:
- New template variables
- Additional display modes
- UI/UX improvements
- Integration features

## 🎉 Credits & Acknowledgments

CarrotKernel builds upon the foundation laid by **BunnyMoTags (depreciated extension)** - we're grateful for the innovation and community that made this possible. This is a spiritual successor, designed to push character consistency tracking into the future while honoring what came before.

**Special thanks to:**
- The SillyTavern development team
- Beta testers and feedback providers

---

*CarrotKernel: Where character consistency meets cutting-edge AI technology* 🥕✨

*Built with ❤️ for the SillyTavern community*
