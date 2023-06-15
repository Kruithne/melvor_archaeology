/** Patches the global fetchLanguageJSON function so we can load and inject our own
 * translations. This is a hackfix because I couldn't find a way for mods to load
 * their own localization. */
async function patch_localization(ctx) {
	const lang_supported = ['en'];
	// 'zh-CN', 'zh-TW', 'fr', 'de', 'it', 'ko', 'ja', 'pt', 'pt-br', 'es', 'ru', 'tr'

	const fetch_mod_localization = async function(lang) {
		// Default to 'en' if we don't have translations.
		const fetch_lang = lang_supported.includes(lang) ? lang : 'en';

		try {
			const patch_lang = await ctx.loadData('lang/' + fetch_lang + '.json');
			for (const [key, value] of Object.entries(patch_lang))
				loadedLangJson[key] = value;
		} catch (e) {
			console.error('Failed to patch localization for %s (%s)', lang, e);
		}
	};

	const orig_fetchLanguageJSON = globalThis.fetchLanguageJSON;
	globalThis.fetchLanguageJSON = async function(lang) {
		await orig_fetchLanguageJSON(lang);
		await fetch_mod_localization(lang);
	}

	// In addition to patching fetchLanguageJSON, we also need to load the current
	// localization as fetchLanguageJSON will be called before the mod initializes.
	if (loadedLangJson !== undefined)
		await fetch_mod_localization(setLang);
}

function UITestTemplate(props) {
	return {
		$template: '#kru-archaeology-test-template'
	}
}

export async function setup(ctx) {
	//console.log('SETUP CALLED');
	console.log(ctx);
	console.log(globalThis);
	console.log(game);

	patch_localization(ctx);
	
	ctx.onCharacterLoaded(() => {
		// Influence offline calculations.
		//console.log('CHARACTER LOADED');
		//game.bank.addItemByID('kru_archaeology:Archaeology_Shovel', 1, false, true);
	});
	
	ctx.onInterfaceReady(() => {
		const $main_container = document.getElementById('main-container');
		ui.create(UITestTemplate(), $main_container);
	});
}