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