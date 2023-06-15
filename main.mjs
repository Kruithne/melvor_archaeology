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
	skill_level_current: 1,
	skill_level_max: 99,

	set_skill_level: (level) => {
		Math.min(Math.max(level, 1), state.skill_level_max);
	}
});

export async function setup(ctx) {
	//console.log('SETUP CALLED');
	console.log(ctx);
	console.log(globalThis);
	console.log(game);
	console.log(state);

	setInterval(() => {
		state.set_skill_level(state.skill_level_current + 1);
	}, 10000);
	
	ctx.onCharacterLoaded(() => {
		// Influence offline calculations.
		//console.log('CHARACTER LOADED');
		game.bank.addItemByID('kru_archaeology:Archaeology_Shovel', 1, false, true);
	});
	
	ctx.onInterfaceReady(() => {
		ui.create(UISidebarLevel(), document.querySelector('.kru-archaeology-sidebar-archaeology'));

		const $main_container = document.getElementById('main-container');
		ui.create(UIArchaeologyContainer(), $main_container);
	});
}