import '../Settings/app_settings.dart';

/// WEURA Strings — كل نصوص التطبيق في مكان واحد
///
/// الاستعمال:
///   Text(WeuraStrings.tagline)
///   Text(WeuraStrings.t('Hello', 'سلام'))
///
/// اللغة الحالية كتجي من [AppSettingsManager.instance.language].
class WeuraStrings {
  WeuraStrings._();

  static bool get isAr {
    return AppSettingsManager.instance.effectiveLanguage == 'Arabic';
  }

  /// Helper عام
  static String t(String en, String ar) => isAr ? ar : en;

  // ===========================================================================
  // APP
  // ===========================================================================
  static String get appName => 'WEURA';
  static String get tagline => t('Think Beyond.', 'فكّر أبعد.');
  static String get homeSubtitle => t(
        'Your intelligent space for ideas, answers and creation.',
        'مساحتك الذكية للأفكار، الأجوبة والإبداع.',
      );

  // ===========================================================================
  // HOME
  // ===========================================================================
  static String get messageHint => t('Message WEURA...', 'راسل WEURA...');

  static String get suggestionExplain =>
      t('Explain something to me', 'اشرحلي حاجة');
  static String get suggestionWrite =>
      t('Help me write something', 'ساعدني نكتب حاجة');
  static String get suggestionAnalyze =>
      t('Analyze this idea', 'حلّل هذه الفكرة');
  static String get suggestionCode =>
      t('Help me code', 'ساعدني في الكود');

  // ===========================================================================
  // DRAWER
  // ===========================================================================
  static String get workspace => t('WORKSPACE', 'مساحة العمل');
  static String get appSection => t('APP', 'التطبيق');
  static String get history => t('History', 'السجل');
  static String get memory => t('Memory', 'الذاكرة');
  static String get settings => t('Settings', 'الإعدادات');
  static String get newChat => t('New Chat', 'محادثة جديدة');

  // ===========================================================================
  // CHAT — Actions
  // ===========================================================================
  static String get copy => t('Copy', 'نسخ');
  static String get copied => t('Copied', 'تم النسخ');
  static String get share => t('Share', 'مشاركة');
  static String get readAloud => t('Read aloud', 'اقرأ بصوت');
  static String get stopReading => t('Stop', 'توقف');
  static String get goodResponse => t('Good response', 'رد جيد');
  static String get badResponse => t('Bad response', 'رد سيء');
  static String get regenerate => t('Regenerate', 'إعادة التوليد');
  static String get retry => t('Retry', 'إعادة المحاولة');
  static String get sources => t('Sources', 'المصادر');
  static String get emptyTitle => t('Think Beyond.', 'فكّر أبعد.');
  static String get emptySubtitle => t('Ask WEURA anything.', 'اسأل WEURA أي حاجة.');

  // ===========================================================================
  // CHAT — Attachment sheet
  // ===========================================================================
  static String get addToWeura => t('Add to WEURA', 'أضف إلى WEURA');
  static String get photos => t('Photos', 'الصور');
  static String get photosHint =>
      t('Attach an image (analyze or edit)', 'أرفق صورة (تحليل أو تعديل)');
  static String get camera => t('Camera', 'الكاميرا');
  static String get cameraHint =>
      t('Capture and attach an image', 'صوّر وأرفق صورة');
  static String get files => t('Files', 'الملفات');
  static String get filesHint =>
      t('PDF, DOCX, XLSX, TXT, CSV', 'PDF, DOCX, XLSX, TXT, CSV');

  // ===========================================================================
  // CHAT — Attachment chips
  // ===========================================================================
  static String get attachedImage => t('Attached image', 'صورة ملصقة');
  static String get writeQuestionOrEdit =>
      t('Write your question or edit request', 'اكتب سؤالك أو طلب التعديل');

  // ===========================================================================
  // CHAT — Edit dialog
  // ===========================================================================
  static String get editMessage => t('Edit message', 'عدّل الرسالة');
  static String get yourMessage => t('Your message', 'رسالتك');
  static String get saveAndSend => t('Save & Send', 'احفظ وابعث');
  static String get cancel => t('Cancel', 'إلغاء');
  static String get save => t('Save', 'حفظ');
  static String get delete => t('Delete', 'حذف');
  static String get close => t('Close', 'إغلاق');
  static String get back => t('Back', 'رجوع');

  // ===========================================================================
  // CHAT — Errors / Status
  // ===========================================================================
  static String get errorCopied => t('Copied', 'تم النسخ');
  static String get errorGalleryDenied =>
      t('Gallery permission denied.', 'تم رفض صلاحية الصور.');
  static String get errorImageNotAvailable =>
      t('Image file not available.', 'ملف الصورة غير متوفر.');
  static String get errorImageNotFound =>
      t('Image file not found.', 'ملف الصورة غير موجود.');
  static String get savedToAlbum =>
      t('Saved to WEURA album', 'تم الحفظ في ألبوم WEURA');
  static String get couldNotSaveImage =>
      t('Could not save image.', 'تعذر حفظ الصورة.');
  static String get couldNotShare =>
      t('Could not share.', 'تعذرت المشاركة.');
  static String get couldNotOpenLink =>
      t('Could not open link.', 'تعذر فتح الرابط.');
  static String get waitForCurrent =>
      t('Wait for the current request to finish.',
          'انتظر انتهاء الطلب الحالي.');
  static String get removeAttachedImageFirst =>
      t('Remove the attached image first.', 'أزل الصورة الملصقة أولاً.');
  static String get removeAttachedFileFirst =>
      t('Remove the attached file first.', 'أزل الملف الملصق أولاً.');
  static String get alreadyHaveImage =>
      t('Already have an image attached.', 'كاينة صورة ملصقة عندك.');
  static String get couldNotOpenCamera =>
      t('Could not open camera.', 'تعذر فتح الكاميرا.');
  static String get couldNotOpenGallery =>
      t('Could not open gallery.', 'تعذر فتح الصور.');
  static String get couldNotReadFile =>
      t('Could not read the file.', 'تعذر قراءة الملف.');
  static String get fileTooLarge =>
      t('File was large — first part will be analyzed.',
          'الملف كبير — الجزء الأول غادي يتحلل.');
  static String get imageTooLarge =>
      t('Image is too large (over 4 MB). Try a smaller one.',
          'الصورة كبيرة بزاف (أكثر من 4 ميغا). جرّب صورة أصغر.');
  static String get imageGenerateFailed =>
      t('Could not generate image. Try again.',
          'تعذر إنشاء الصورة. جرّب مرة أخرى.');
  static String get imageNotAvailable =>
      t('Image unavailable', 'الصورة غير متوفرة');
  static String get saveToGallery => t('Save to gallery', 'احفظ في المعرض');
  static String get copyImageUrl => t('Copy image URL', 'انسخ رابط الصورة');
  static String get viewFullscreen =>
      t('View fullscreen', 'عرض بملء الشاشة');

  // ===========================================================================
  // CHAT — AI Modes
  // ===========================================================================
  static String get aiMode => t('AI Mode', 'وضع الذكاء');
  static String get modeAuto => t('Auto', 'تلقائي');
  static String get modeSmart => t('Smart', 'ذكي');
  static String get modeFast => t('Fast', 'سريع');
  static String get modeResearch => t('Research', 'بحث');
  static String get modeCode => t('Code', 'كود');
  static String get modeCreative => t('Creative', 'إبداعي');
  static String get modeVision => t('Vision', 'رؤية');
  static String get modeFiles => t('Files', 'ملفات');
  static String get modeTranslation => t('Translation', 'ترجمة');

  // ===========================================================================
  // CHAT — Thinking
  // ===========================================================================
  static String get thinking => t('WEURA is thinking...', 'WEURA يفكّر...');
  static String get footballThinking =>
      t('Football thinking...', 'تفكير كروي...');
  static String get creatingImage =>
      t('Creating your image', 'نصنع صورتك');
  static String get canTakeSeconds =>
      t('This can take 5-15 seconds', 'ياخذ 5-15 ثانية');

  // ===========================================================================
  // CHAT — Player card (partial)
  // ===========================================================================
  static String get currentClub => t('Current club', 'النادي الحالي');
  static String get lastTransfer => t('Last transfer', 'آخر انتقال');
  static String get marketValue => t('Market value', 'القيمة السوقية');
  static String get trophies => t('Trophies', 'الألقاب');
  static String get latestNews => t('Latest news', 'آخر الأخبار');
  static String get bio => t('Bio', 'نبذة');
  static String get sourcesCount => isAr ? 'مصادر' : 'sources';

  // ===========================================================================
  // SETTINGS
  // ===========================================================================
  static String get settingsTitle => t('Settings', 'الإعدادات');
  static String get appearance => t('APPEARANCE', 'المظهر');
  static String get sectionAI => t('AI', 'الذكاء الاصطناعي');
  static String get sectionVoice => t('VOICE', 'الصوت');
  static String get sectionChat => t('CHAT', 'المحادثة');
  static String get sectionConnection => t('CONNECTION', 'الاتصال');
  static String get sectionPrivacy => t('PRIVACY', 'الخصوصية');
  static String get sectionAbout => t('ABOUT', 'حول');

  static String get appearanceLabel => t('Appearance', 'المظهر');
  static String get languageLabel => t('Language', 'اللغة');
  static String get textDirection => t('Text direction', 'اتجاه النص');
  static String get yourName => t('Your name', 'اسمك');
  static String get notSet => t('Not set', 'غير محدد');
  static String get defaultAIMode => t('Default AI mode', 'وضع AI الافتراضي');
  static String get responseDetail => t('Response detail', 'تفصيل الردود');
  static String get memoryToggle => t('Memory', 'الذاكرة');
  static String get memoryToggleHint =>
      t('Allow WEURA to use saved memories', 'اسمح لـWEURA باستعمال الذكريات');
  static String get voiceInput => t('Voice input', 'إدخال صوتي');
  static String get voiceInputHint =>
      t('Use your microphone for messages', 'استعمل الميكرو للرسائل');
  static String get voiceOutput => t('Voice output', 'إخراج صوتي');
  static String get voiceOutputHint =>
      t('Read AI responses aloud', 'اقرأ ردود AI بصوت عالي');
  static String get autoSaveHistory => t('Auto-save history', 'حفظ تلقائي للسجل');
  static String get autoSaveHistoryHint =>
      t('Automatically save conversations', 'احفظ المحادثات تلقائياً');
  static String get sendOnEnter => t('Send on Enter', 'ابعث بـEnter');
  static String get sendOnEnterHint =>
      t('Press Enter to send a message', 'اضغط Enter لبعث الرسالة');
  static String get aiConnection => t('AI connection', 'الاتصال بالـAI');
  static String get clearLocalData => t('Clear local data', 'امسح البيانات المحلية');
  static String get clearLocalDataHint =>
      t('Remove locally stored WEURA data', 'أزل بيانات WEURA المحلية');
  static String get aboutWeura => t('About WEURA', 'حول WEURA');
  static String get aboutWeuraHint => 'WEURA AI • v1.0.0';
  static String get resetSettings => t('Reset settings', 'إعادة تعيين');
  static String get aboutTitle => t('About WEURA', 'حول WEURA');

  // ===========================================================================
  // VOICE SHEET
  // ===========================================================================
  static String get voiceListening => t('Listening...', 'يستمع...');
  static String get voiceUnavailable => t('Unavailable', 'غير متوفر');
  static String get voiceInputTitle => t('Voice input', 'إدخال صوتي');
  static String get voiceSpeakNow => t('Speak now...', 'اتكلم الآن...');
  static String get voiceNoSound => t('No sound captured.', 'لم يتم التقاط أي صوت.');
  static String get voiceStop => t('Stop', 'إيقاف');
  static String get voiceSend => t('Send', 'إرسال');
  static String get voiceSwitchArabic => t('العربية', 'العربية');
  static String get voiceSwitchEnglish => t('English', 'English');

  // ===========================================================================
  // HISTORY
  // ===========================================================================
  static String get historyTitle => t('History', 'السجل');
  static String get searchConversations =>
      t('Search conversations...', 'ابحث في المحادثات...');
  static String get noResults => t('No results found', 'لا توجد نتائج');
  static String get noConversations =>
      t('No conversations yet', 'لا توجد محادثات بعد');
  static String get tryDifferentSearch =>
      t('Try a different search term.', 'جرّب كلمة بحث أخرى.');
  static String get conversationsWillAppear => t(
        'Your conversations will appear here.',
        'ستظهر محادثاتك هنا.',
      );
  static String get rename => t('Rename', 'إعادة تسمية');
  static String get renameChat => t('Rename chat', 'إعادة تسمية المحادثة');
  static String get chatName => t('Chat name', 'اسم المحادثة');
  static String get deleteChat => t('Delete chat?', 'حذف المحادثة؟');
  static String get deleteChatHint => t(
        'This conversation will be removed from history.',
        'سيتم إزالة هذه المحادثة من السجل.',
      );
  static String get deleteAll => t('Delete all', 'حذف الكل');
  static String get deleteAllChats => t('Delete all chats?', 'حذف كل المحادثات؟');
  static String get deleteAllChatsHint => t(
        'This will remove all conversations from this history.',
        'سيتم إزالة كل المحادثات من السجل.',
      );
  static String get today => t('Today', 'اليوم');
  static String get yesterday => t('Yesterday', 'أمس');
  static String messagesCount(int n) =>
      isAr ? '$n رسالة' : '$n messages';

  // ===========================================================================
  // MEMORY
  // ===========================================================================
  static String get memoryTitle => t('Memory', 'الذاكرة');
  static String get searchMemory => t('Search memory...', 'ابحث في الذاكرة...');
  static String get addMemory => t('Add memory', 'إضافة ذكرى');
  static String get editMemory => t('Edit memory', 'تعديل الذكرى');
  static String get whatShouldRemember =>
      t('What should WEURA remember?', 'شو تحب WEURA يتفكر؟');
  static String get rememberTitle => t(
        'WEURA remembers what matters.',
        'WEURA يتذكر ما يهم.',
      );
  static String get rememberHint => t(
        'Add useful preferences or information that you want WEURA to remember.',
        'أضف تفضيلات أو معلومات تريد أن يتذكرها WEURA.',
      );
  static String get edit => t('Edit', 'تعديل');
  static String get deleteMemory => t('Delete this memory?', 'حذف هذه الذكرى؟');
  static String get clearMemory => t('Clear memory?', 'مسح كل الذاكرة؟');
  static String get clearMemoryHint => t(
        'All saved memories will be removed.',
        'سيتم إزالة كل الذكريات المحفوظة.',
      );
  static String get clear => t('Clear', 'مسح');

  // ===========================================================================
  // SPLASH
  // ===========================================================================
  static String get loading => t('Loading...', 'جاري التحميل...');
}