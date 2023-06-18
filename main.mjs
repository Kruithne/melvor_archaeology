/**
 * BE WARNED, ALL YE WHO ENTER HERE
 * This mod has been created in a very short amount of time for the Melvor Mod Contest 2023
 * by someone who has never created a Melvor mod before. I am fully aware that things could
 * be done *a lot* better, especially around skill registration, but the priority was to
 * create content over improving code quality. You should *not* use this mod as an example
 * of how to create a Melvor mod - there are much less hacky ways!
 * 
 * I hope you enjoy the mod regardless!
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

let current_tick = 0;

let is_offline = true;
let offline_progress = {
	xp: 0,
	gp: 0,
	excavations: 0,
	items: {}
};

const ctx = mod.getContext(import.meta);
const state = ui.createStore({
	skill_xp: 0,
	skill_level_max: 99,
	active_digsite: null,

	/** Get the URL for a requirement icon. */
	get_requirement_icon(id) {
		if (id === 'level')
			return ctx.getResourceUrl('assets/svg/archaeology.svg');

		if (id === 'gold')
			return 'assets/media/main/coins.svg';

		return game.items.getObjectByID(id).media;
	},

	/** Formats a digsite requirement into a human-readable string. */
	format_requirement_string(id, value) {
		if (id === 'level')
			return templateLangString('MENU_TEXT_LEVEL', { level: value });

		if (id === 'gold')
			return formatNumber(value);

		return formatNumber(value) + ' ' + get_localized_item_name(id);
	},

	/** Returns true if the digsite requirement is met by the player. */
	is_requirement_met(id, value) {
		if (id === 'level')
			return this.skill_level >= value;

		if (id === 'gold')
			return game.gp.amount >= value;

		return game.bank.getQty(game.items.getObjectByID(id)) >= value;
	},

	/** Returns the CSS class for the given requirement. */
	get_requirement_class(id, value) {
		return this.is_requirement_met(id, value) ? 'text-success' : 'text-danger';
	},

	/** Gives the player the necessary unlock requirements. */
	debug_give_requirements(digsite) {
		for (const [r_id, r_value] of Object.entries(digsite.requirements)) {
			if (r_id === 'level') {
				const required_xp = exp.level_to_xp(r_value + 1);
				if (this.skill_xp < required_xp)
					this.skill_xp = required_xp;

				continue;
			}

			if (r_id === 'gold')
				game.gp.add(r_value);
			else
				game.bank.addItemByID(r_id, r_value);
		}

		update_digsite_requirements();
	},

	/** Sets the provided digsite as the active excavation. */
	start_digsite(digsite) {
		const digsite_state = digsite.state;
		if (digsite_state.active || !digsite_state.unlocked)
			return;

		if (state.active_digsite)
			state.active_digsite.state.active = false;

		digsite_state.active = true;
		digsite_state.ticks_remaining = digsite.duration;
		state.active_digsite = digsite;
	},

	/** Stops the active excavation. */
	stop_excavating() {
		if (state.active_digsite) {
			const digsite_state = state.active_digsite.state;
			digsite_state.active = false;
			digsite_state.ticks_remaining = 0;
		}

		state.active_digsite = null;
	},

	/** Unlocks a digsite. */
	unlock_digsite(digsite) {
		if (digsite.state.unlocked)
			return;

		for (const [r_id, r_value] of Object.entries(digsite.requirements)) {
			if (!this.is_requirement_met(r_id, r_value)) {
				notify_error('MOD_KA_TOAST_DIGSITE_REQUIREMENT');
				return;
			}
		}

		for (const [r_id, r_value] of Object.entries(digsite.requirements)) {
			if (r_id === 'level')
				continue;

			if (r_id === 'gold')
				game.gp.remove(r_value);
			else
				game.bank.removeItemQuantityByID(r_id, r_value);
		}

		digsite.state.unlocked = true;
	},

	/** Formats a tick duration as a human-readable string. */
	format_ticks(ticks) {
		const minutes = Math.floor(ticks / TICKS_PER_MINUTE);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) {
			if (hours === 1)
				return getLangString('TIME_UNIT_hour');

			return templateLangString('TIME_UNIT_hours', { hours });
		}

		if (minutes === 1)
			return getLangString('TIME_UNIT_minute');

		return templateLangString('TIME_UNIT_minutes', { minutes });
	},

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
		
		const save_state = JSON.parse(fs.readFileSync(tmp_state_file, 'utf8'));
		if (save_state) {
			this.skill_xp = save_state.skill_xp ?? 0;
			
			if (save_state.digsites) {
				for (const [digsite_id, digsite_data] of Object.entries(save_state.digsites)) {
					const target_digsite = state.content.digsites[digsite_id];
					if (!target_digsite)
						continue;

					target_digsite.state = digsite_data;

					if (digsite_data.active) {
						if (state.active_digsite !== null)
							digsite_data.active = false;
						else
							state.active_digsite = target_digsite;
					}
				}
			}
		}
	},

	/** Persist the skill state to mod settings. */
	save_state(ctx) {
		// TODO: Swap this when mod is on mod.io

		const digsites = {};
		for (const [digsite_id, digsite_data] of Object.entries(state.content.digsites))
			digsites[digsite_id] = digsite_data.state;

		const save_state = {
			skill_xp: this.skill_xp,
			digsites
		};

		const tmp_state_file = path.join(os.tmpdir(), 'archaeology_state.json');
		fs.writeFileSync(tmp_state_file, JSON.stringify(save_state));

		//ctx.characterStorage.setItem('state', save_state);
	}
});

/** Send an error toast notification to the player. */
function notify_error(lang_id, icon) {
	notify(lang_id, 'danger', icon);
}

/** Send a toast notification to the player. */
function notify(lang_id, theme = 'danger', icon = 'assets/svg/archaeology.svg') {
	notifyPlayer({ media: ctx.getResourceUrl(icon) }, getLangString(lang_id), theme);
}

/** Called on every game tick. */
function passiveTick() {
	//if (current_tick % TICKS_PER_SECOND === 0)
		//state.skill_xp += 50;

	if (state.active_digsite !== null)
		process_digsite_tick(state.active_digsite);

	current_tick++;
}

/** Process a tick for the active digsite. */
function process_digsite_tick(digsite) {
	const digsite_state = digsite.state;

	digsite_state.ticks_remaining--;
	if (digsite_state.ticks_remaining <= 0) {
		digsite_state.ticks_remaining = digsite.duration;

		state.skill_xp += digsite.xp;
		game.gp.add(digsite.gp);

		if (is_offline) {
			offline_progress.excavations++;
			offline_progress.xp += digsite.xp;
			offline_progress.gp += digsite.gp;
		}

		for (const loot_slot of digsite.loot) {
			if (Math.random() >= loot_slot.chance)
				continue;

			const item = loot_slot.items[Math.floor(Math.random() * loot_slot.items.length)];
			const item_qty = Math.floor(Math.random() * (item.quantity_max - item.quantity_min + 1)) + item.quantity_min;

			game.bank.addItemByID(item.id, item_qty, true, true);

			if (is_offline) {
				if (!offline_progress.loot[item.id])
					offline_progress.loot[item.id] = item_qty;
				else
					offline_progress.loot[item.id] += item_qty;
			}
		}
	}
}

function update_digsite_requirements() {
	const requirements = document.querySelectorAll('.ka-area-requirement-string');
	for (const requirement of requirements) {
		const id = requirement.dataset.requireId;
		const value = parseInt(requirement.dataset.requireValue);

		requirement.classList.remove('text-success', 'text-danger');
		requirement.classList.add(state.get_requirement_class(id, value));
	}
}

/** Render the offline progress modal for archaeology */
async function render_offline_modal() {
	if (offline_progress.excavations === 0)
		return;

	const entries = [];
	const skill_icon = await ctx.getResourceUrl('assets/svg/archaeology.svg');

	const header = `<h5 class="font-w400 mb-1">${templateLangString('MOD_KA_OFFLINE_PROGRESS', { amount: offline_progress.excavations })}</h5>`;

	for (const [item_id, item_qty] of Object.entries(offline_progress.items)) {
		const item_name = get_localized_item_name(item_id);
		const item_icon = game.items.getObjectByID(item_id).media;

		entries.push({ qty: item_qty, name: item_name, icon: item_icon });
	}

	if (offline_progress.xp > 0)
		entries.push({ qty: offline_progress.xp, name: templateLangString('MENU_TEXT_XP_AMOUNT', { xp: getLangString('MOD_KA_SKILL_ARCHAEOLOGY') }), icon: skill_icon });

	if (offline_progress.gp > 0)
		entries.push({ qty: offline_progress.gp, name: getLangString('MENU_TEXT_GP'), icon: 'assets/media/main/coins.svg' });

	addModalToQueue({
		title: getLangString('MOD_KA_OFFLINE_HEADER'),
		html: header + entries.map(entry => `<h5 class="font-w600 mb-1">You gained <span class="text-success">${formatNumber(entry.qty)}</span> <img class="skill-icon-xs" src="${entry.icon}"> ${entry.name}</h5>`).join(''),
		imageUrl: skill_icon,
		imageWidth: 64,
		imageHeight: 64,
		imageAlt: getLangString('MOD_KA_SKILL_ARCHAEOLOGY'),
		allowOutsideClick: false,
	});

	offline_progress = undefined;
}

/** Resolves a localized name for an item. */
function get_localized_item_name(id) {
	const colon_index = id.indexOf(':');
	if (colon_index !== -1)
		id = id.substring(colon_index + 1);

	return getLangString('ITEM_NAME_' + id);
}

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

/** Load the necessary SVG file for an element. */
async function load_svg_asset(ctx, $elem) {
	const svg_path = 'assets/svg/' + $elem.getAttribute('data-ka-svg') + '.svg';
	const svg_url = await ctx.getResourceUrl(svg_path);

	$elem.style.backgroundImage = 'url(' + svg_url + ')';
}

/** Loads SVG files referenced in the DOM. This is a workaround for the fact
 * that assets referenced in a mods CSS file do not resolve correctly. */
async function load_svg_assets(ctx) {
	const $elements = document.querySelectorAll('[data-ka-svg]');
	for (const $elem of $elements)
		await load_svg_asset(ctx, $elem);

	// Detect elements with data-ka-svg being added to the DOM and load them.
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (node.nodeType === Node.ELEMENT_NODE) {
					const $node = node;
					if ($node.hasAttribute('data-ka-svg'))
						load_svg_asset(ctx, $node);
				}
			}
		}
	});

	observer.observe(document.body, { childList: true, subtree: true });
}

/** Loads the mod-specific content and resolves the necessary localization. */
async function load_content(ctx) {
	const content = await ctx.loadData('data/content.json');

	for (const digsite of Object.values(content.digsites)) {
		digsite.name = getLangString(digsite.name);
		digsite.state = {
			active: false,
			unlocked: false,
			ticks_remaining: 0,
		};
	}

	state.content = content;
}

/** Loads mod-specific items with localization. */
async function load_items(ctx) {
	// Items are loaded from data/items.json instead of being provided in
	// the mod data.json because the latter does not support localization.

	const items = await ctx.loadData('data/items.json');
	ctx.gameData.buildPackage(pkg => {
		for (const item of items) {
			item.name = getLangString(item.name);

			if (item.customDescription)
				item.customDescription = getLangString(item.customDescription);

			pkg.items.add(item);
		}
	}).add();
}

export async function setup(ctx) {
	await patch_localization(ctx);
	patch_save_data(ctx);

	await load_items(ctx);
	await load_content(ctx);

	ctx.onCharacterLoaded(() => {
		state.load_state(ctx);
		game._passiveTickers.push({ passiveTick });
	});
	
	ctx.onInterfaceReady(() => {
		is_offline = false;

		ui.create(UISidebarLevel(), document.querySelector('.kru-archaeology-sidebar-archaeology'));

		const $main_container = document.getElementById('main-container');
		ui.create(UIArchaeologyContainer(), $main_container);

		const $container = document.getElementById('kru-archaeology-container');
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.attributeName === 'class') {
					if (!$container.classList.contains('d-none'))
						update_digsite_requirements();
				}
			}
		});

		observer.observe($container, { attributes: true });

		render_offline_modal(ctx);
		load_svg_assets(ctx);
	});
}

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