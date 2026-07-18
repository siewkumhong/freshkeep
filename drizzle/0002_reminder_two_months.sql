UPDATE `reminder_deliveries`
SET `reminder_on` = (
	SELECT date(
		date(`items`.`item_date`, 'start of month', '-2 months'),
		'+' || (
			min(
				CAST(strftime('%d', `items`.`item_date`) AS integer),
				CAST(strftime('%d', date(`items`.`item_date`, 'start of month', '-1 month', '-1 day')) AS integer)
			) - 1
		) || ' days'
	)
	FROM `items`
	WHERE `items`.`id` = `reminder_deliveries`.`item_id`
)
WHERE EXISTS (
	SELECT 1
	FROM `items`
	WHERE `items`.`id` = `reminder_deliveries`.`item_id`
		AND `items`.`reminder_on` = `reminder_deliveries`.`reminder_on`
);

UPDATE `items`
SET `reminder_on` = date(
	date(`item_date`, 'start of month', '-2 months'),
	'+' || (
		min(
			CAST(strftime('%d', `item_date`) AS integer),
			CAST(strftime('%d', date(`item_date`, 'start of month', '-1 month', '-1 day')) AS integer)
		) - 1
	) || ' days'
);
