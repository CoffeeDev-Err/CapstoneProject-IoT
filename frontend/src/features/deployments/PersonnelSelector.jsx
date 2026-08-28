import { SkeletonBlock } from '../../components/LoadingSkeleton'

function PersonnelSelector({
	activePersonnelIds,
	areAllFilteredSelected,
	filteredPersonnelOptions,
	isInitialDataLoading,
	isSelectionInvalid,
	onSearchChange,
	onToggle,
	onToggleAll,
	search,
	selectableCount,
	selectionHint,
}) {
	return (
		<div className="assignment-field assignment-field--personnel">
			<span>Personnel Selection *</span>
			<input
				type="search"
				className="settings-input w-100 assignment-search-input"
				value={search}
				onChange={(event) => onSearchChange(event.target.value)}
				placeholder="Search personnel name or rank"
				disabled={isInitialDataLoading}
				aria-describedby="assignment-personnel-hint"
			/>
			<div className="assignment-checklist no-scrollbar">
				{isInitialDataLoading ? (
					Array.from({ length: 4 }, (_, index) => (
						<SkeletonBlock key={index} width={`${78 + (index % 3) * 7}%`} height="2.25rem" />
					))
				) : filteredPersonnelOptions.length === 0 ? (
					<p className="assignment-checklist__empty mb-0">No personnel matches your search.</p>
				) : filteredPersonnelOptions.map((option) => (
					<label
						key={option.id}
						className={`assignment-check-item${option.isMockPersonnel ? ' is-mock' : ''}`}
					>
						<input
							type="checkbox"
							checked={activePersonnelIds.includes(option.id)}
							onChange={() => onToggle(option.id)}
							disabled={option.isMockPersonnel}
						/>
						<span>
							{option.name} - {option.rank}
							{option.isMockPersonnel && <small>Mock search record</small>}
						</span>
					</label>
				))}
			</div>
			<div className="assignment-field__hint-row">
				<small
					id="assignment-personnel-hint"
					className={`assignment-field__hint${isSelectionInvalid ? ' is-error' : ''}`}
				>
					{selectionHint}
				</small>
				<button
					type="button"
					className="assignment-inline-btn"
					onClick={onToggleAll}
					disabled={isInitialDataLoading || selectableCount === 0}
				>
					{areAllFilteredSelected ? 'Clear Filtered' : 'Select All Filtered'}
				</button>
			</div>
		</div>
	)
}

export default PersonnelSelector
