const fs = require('fs');
const os = require('os');
const path = require('path');

let is_offline = true;
let offline_progress = {
	start_level: 1,
	xp: 0,
	gp: 0,
	excavations: 0,
	items: {}
};

const ctx = mod.getContext(import.meta);
let skill = null;

const state = ui.createStore({
	active_digsite: null,

	/** Returns a resource path for an SVG asset. */
	get_svg(id) {
		return ctx.getResourceUrl('assets/svg/' + id + '.svg');
	},

	/** Returns the CSS URL syntax for an SVG asset. */
	get_svg_url(id) {
		return 'url(' + this.get_svg(id) + ')';
	},

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
			return skill.level >= value;

		if (id === 'gold')
			return game.gp.amount >= value;

		return game.bank.getQty(game.items.getObjectByID(id)) >= value;
	},

	/** Returns the CSS class for the given requirement. */
	get_requirement_class(id, value) {
		return this.is_requirement_met(id, value) ? 'text-success' : 'text-danger';
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

	/** Returns the amount of XP required to reach the next level. */
	get next_level_xp() {
		return exp.level_to_xp(skill.level + 1);
	},

	/** Render the drops modal for a digsite. */
	render_drops_modal(digsite) {
		const entries = [];

		for (const loot_slot of digsite.loot) {
			for (const loot_item of loot_slot.items) {
				if (loot_item.hide_from_drops)
					continue;

				const item = game.items.getObjectByID(loot_item.id);
				const item_found = game.stats.itemFindCount(item);

				const item_name = item_found ? item.name : getLangString('THIEVING_UNDISCOVERED_ITEM');
				const item_icon = item_found ? item.media : cdnMedia('assets/media/main/question.svg');

				const item_qty = loot_item.quantity_min === loot_item.quantity_max ? loot_item.quantity_min : `${loot_item.quantity_min}-${loot_item.quantity_max}`;

				entries.push({ qty: item_qty, name: item_name, icon: item_icon });
			}
		}

		addModalToQueue({
			title: digsite.name,
			html: entries.map(entry => `<h5 class="font-w600 mb-1">${entry.qty}x <img class="skill-icon-xs" src="${entry.icon}"> ${entry.name}</h5>`).join(''),
			imageUrl: ctx.getResourceUrl(digsite.icon),
			imageWidth: 64,
			imageHeight: 64,
			imageAlt: getLangString('SKILL_NAME_Archaeology'),
			allowOutsideClick: false,
		});
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

		const save_state = { digsites };

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
	if (state.active_digsite !== null)
		process_digsite_tick(state.active_digsite);
}

/** Process a tick for the active digsite. */
function process_digsite_tick(digsite) {
	const digsite_state = digsite.state;

	digsite_state.ticks_remaining--;
	if (digsite_state.ticks_remaining <= 0) {
		digsite_state.ticks_remaining = digsite.duration;

		try {
			complete_digsite(digsite);
		} catch (e) {
			// Catch errors here otherwise they bubble to runTicks() which causes tick
			// processing to stop and could result in the player losing progress especially
			// when processing large offline tick quantities.
			console.error(e);
		}
	}
}

/** Run the completion of a digsite, sending rewards to player. */
function complete_digsite(digsite) {
	skill.addXP(digsite.xp);
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
			if (!offline_progress.items[item.id])
				offline_progress.items[item.id] = item_qty;
			else
				offline_progress.items[item.id] += item_qty;
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

	if (skill.level > offline_progress.start_level)
		entries.push({ qty: skill.level - offline_progress.start_level, name: getLangString('MOD_KA_OFFLINE_LEVELS'), icon: skill_icon});

	if (offline_progress.xp > 0)
		entries.push({ qty: offline_progress.xp, name: templateLangString('MENU_TEXT_XP_AMOUNT', { xp: getLangString('SKILL_NAME_Archaeology') }), icon: skill_icon });

	if (offline_progress.gp > 0)
		entries.push({ qty: offline_progress.gp, name: getLangString('MENU_TEXT_GP'), icon: 'assets/media/main/coins.svg' });

	addModalToQueue({
		title: getLangString('MOD_KA_OFFLINE_HEADER'),
		html: header + entries.map(entry => `<h5 class="font-w600 mb-1">You gained <span class="text-success">${formatNumber(entry.qty)}</span> <img class="skill-icon-xs" src="${entry.icon}"> ${entry.name}</h5>`).join(''),
		imageUrl: skill_icon,
		imageWidth: 64,
		imageHeight: 64,
		imageAlt: getLangString('SKILL_NAME_Archaeology'),
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

	await ctx.loadTemplates('ui/templates.html');

	ui.create({ $template: '#template-kru-archaeology-container', state	}, document.body);

	game.registerSkill(game.registeredNamespaces.getNamespace('kru_archaeology'), ArchaeologySkill);
	skill = game.skills.registeredObjects.get('kru_archaeology:Archaeology');

	await ctx.gameData.addPackage('data.json');

	ctx.onCharacterLoaded(() => {
		state.load_state(ctx);
		offline_progress.start_level = skill.level;
		game._passiveTickers.push({ passiveTick });
	});
	
	ctx.onInterfaceReady(() => {
		is_offline = false;		

		const $container = document.getElementById('kru-archaeology-container');
		const $main_container = document.getElementById('main-container');
		$main_container.appendChild($container);

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
	});
}

class ArchaeologySkill extends Skill {
	constructor(namespace, game) {
		super(namespace, 'Archaeology', game);
		this.renderQueue = new ArchaeologySkillRenderQueue();
		this._media = 'assets/svg/archaeology.svg';
	}
}

class ArchaeologySkillRenderQueue extends SkillRenderQueue {
	constructor() {
		super(...arguments);
	}

	onLevelUp(oldLevel, newLevel) {
		if (!is_offline)
			update_digsite_requirements();
	}
}