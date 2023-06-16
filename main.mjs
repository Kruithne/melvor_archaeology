const fs = require('fs');
const os = require('os');
const path = require('path');

function UIArchaeologyContainer() {
	return {
		$template: '#template-kru-archaeology-container',
		state
	}
}

function UISidebarLevel() {
	return {
		$template: '#template-kru-archaeology-sidebar',
		state
	}
}

const state = ui.createStore({
	skill_xp: 0,
	skill_level_max: 99,

	digsite_areas: [
		{
			name: 'Digsite Alpha'
		},
		{
			name: 'Digsite Beta'
		},
		{
			name: 'Digsite Gamma'
		}
	],

	/** Returns the current skill level. */
	get skill_level() {
		return Math.min(this.skill_level_max, exp.xpToLevel(this.skill_xp));
	},

	/** Returns the amount of XP required to reach the next level. */
	get next_level_xp() {
		return exp.level_to_xp(this.skill_level + 1);
	},

	/** Returns progress through the current level as a fraction. */
	get current_level_frac() {
		return (this.skill_xp - exp.level_to_xp(this.skill_level)) / (this.next_level_xp - exp.level_to_xp(this.skill_level));
	},

	/** Adds XP to the skill. */
	add_xp(xp) {
		this.skill_xp += xp;
	},

	/** Load the skill state from mod settings. */
	load_state(ctx) {
		// TODO: Swap this when mod is on mod.io
		//const state = ctx.characterStorage.getItem('state');

		const tmp_state_file = path.join(os.tmpdir(), 'archaeology_state.json');
		if (!fs.existsSync(tmp_state_file))
			return;
		
		const state = JSON.parse(fs.readFileSync(tmp_state_file, 'utf8'));
		if (state) {
			this.skill_xp = state.skill_xp;
		}
	},

	/** Persist the skill state to mod settings. */
	save_state(ctx) {
		// TODO: Swap this when mod is on mod.io

		const save_state = {
			skill_xp: this.skill_xp
		};

		const tmp_state_file = path.join(os.tmpdir(), 'archaeology_state.json');
		fs.writeFileSync(tmp_state_file, JSON.stringify(save_state));

		//ctx.characterStorage.setItem('state', save_state);
	}
});

/** Patches the global fetchLanguageJSON() fn so we can load and inject our own
 * translations. This is a hackfix because I couldn't find a way for mods to load
 * their own translations via data. */
async function patch_localization(ctx) {
	const lang_supported = ['en'];

	const fetch_mod_localization = async (lang) => {
		const fetch_lang = lang_supported.includes(lang) ? lang : 'en';

		try {
			const patch_lang = await ctx.loadData('data/lang/' + fetch_lang + '.json');
			for (const [key, value] of Object.entries(patch_lang))
				loadedLangJson[key] = value;
		} catch (e) {
			console.error('Failed to patch localization for %s (%s)', fetch_lang, e);
		}
	};

	const orig_fetchLanguageJSON = globalThis.fetchLanguageJSON;
	globalThis.fetchLanguageJSON = async (lang) => {
		await orig_fetchLanguageJSON(lang);
		await fetch_mod_localization(lang);
	}

	if (loadedLangJson !== undefined)
		await fetch_mod_localization(setLang);
}

/** Patches the global saveData() fn so we can save our own state. */
function patch_save_data(ctx) {
	const fn_saveData = globalThis.saveData;

	globalThis.saveData = () => {
		state.save_state(ctx);
		fn_saveData();
	};
}

/** Loads SVG files referenced in the DOM. This is a workaround for the fact
 * that assets referenced in a mods CSS file do not resolve correctly. */
async function load_svg_assets(ctx) {
	const $elements = document.querySelectorAll('[data-ka-svg]');
	for (const $elem of $elements) {
		const svg_path = 'assets/svg/' + $elem.getAttribute('data-ka-svg') + '.svg';
		const svg_url = await ctx.getResourceUrl(svg_path);

		$elem.style.backgroundImage = 'url(' + svg_url + ')';
	}
}

/** Loads the mod-specific content and resolves the necessary */
async function load_content(ctx) {
	const content = await ctx.loadData('data/content.json');

	for (const digsite of content.digsites) {
		digsite.name = getLangString(digsite.name);
	}

	state.content = content;
}

export async function setup(ctx) {
	//console.log('SETUP CALLED');
	console.log(ctx);
	console.log(globalThis);
	console.log(game);
	console.log(state);

	await patch_localization(ctx);
	patch_save_data(ctx);

	await load_content(ctx);

	ctx.onCharacterLoaded(() => {
		state.load_state(ctx);
		game.bank.addItemByID('kru_archaeology:Archaeology_Shovel', 1, false, true);
	});
	
	ctx.onInterfaceReady(() => {
		ui.create(UISidebarLevel(), document.querySelector('.kru-archaeology-sidebar-archaeology'));

		const $main_container = document.getElementById('main-container');
		ui.create(UIArchaeologyContainer(), $main_container);

		load_svg_assets(ctx);
	});
}