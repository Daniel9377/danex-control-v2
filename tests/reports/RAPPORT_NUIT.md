# Rapport de test nuit — DANEX Control — jeudi 18 juin 2026 à 22:58

## 1. Résumé général
- État : Application instable
- Tests réussis : 19 / 42
- Tests échoués : 8
- Lancements terminés cette nuit : 5
- Zones les plus fragiles : dashboard (3), accounts (3), debts (2)

## 2. Bugs critiques
1. Dashboard - transactions vides affichent des zeros propres sans NaN — intermittent
   - Zone : dashboard
   - Action faite : Le test a exécuté le scénario "Dashboard - transactions vides affichent des zeros propres sans NaN".
   - Résultat attendu : expected) Expected pattern: not /NaN/i Received string: "DANEXTableau de bordComptesTransactionsBusinessClientsCommandesDettes & CréancesTransfertsOutilsRapportsExportMigrationAlertesParamètresv2.
   - Résultat obtenu : actuel\\\",\\\"this_month_detail\\\":\\\"Ce mois-ci\\\",\\\"income_in\\\":\\\"Entrées\\\",\\\"expense_out\\\":\\\"Sorties\\\",\\\"net\\\":\\\"Net\\\",\\\"recent_ops\\\":\\\"Dernières opérations\\\",\\\"no_ops\\\":\\\"Aucune opération enregistrée\\\",\\\"delete_confirm\\\":\\\"Supprimer ce compte ?\\\"},\\\"transactions\\\":{\\\"title\\\":\\\"Transactions\\\",\\\"add\\\":\\\"Nouvelle transaction\\\",\\\"type\\\":\\\"Type\\\",\\\"amount\\\":\\\"Montant\\\",\\\"account\\\":\\\"Compte\\\",\\\"category\\\":\\\"Catégorie\\\",\\\"date\\\":\\\"Date\\\",\\\"note\\\":\\\"Note\\\",\\\"income\\\":\\\"Revenu\\\",\\\"expense\\\":\\\"Dépense\\\",\\\"filters\\\":{\\\"all_types\\\":\\\"Tous les types\\\",\\\"all_accounts\\\":\\\"Tous les comptes\\\",\\\"all_categories\\\":\\\"Toutes les catégories\\\"}},\\\"transfers\\\":{\\\"title\\\":\\\"Transferts\\\",\\\"add\\\":\\\"Nouveau transfert\\\",\\\"from\\\":\\\"De\\\",\\\"to\\\":\\\"Vers\\\",\\\"from_amount\\\":\\\"Montant envoyé\\\",\\\"to_amount\\\":\\\"Montant reçu\\\",\\\"exchange_rate\\\":\\\"Taux de change\\\",\\\"date\\\":\\\"Date\\\",\\\"note\\\":\\\"Note\\\"},\\\"debts\\\":{\\\"title\\\":\\\"Dettes \\u0026 Créances\\\",\\\"add\\\":\\\"Nouvelle entrée\\\",\\\"i_owe\\\":\\\"Mes dettes\\\",\\\"owes_me\\\":\\\"Mes créances\\\",\\\"person\\\":\\\"Personne\\\",\\\"amount\\\":\\\"Montant\\\",\\\"paid\\\":\\\"Payé\\\",\\\"remaining\\\":\\\"Restant\\\",\\\"status\\\":\\\"Statut\\\",\\\"due_date\\\":\\\"Échéance\\\",\\\"note\\\":\\\"Note\\\",\\\"linked_account\\\":\\\"Compte lié\\\",\\\"add_payment\\\":\\\"Ajouter un paiement\\\",\\\"payment_history\\\":\\\"Historique des paiements\\\",\\\"statuses\\\":{\\\"unpaid\\\":\\\"Impayé\\\",\\\"partial\\\":\\\"Partiel\\\",\\\"paid\\\":\\\"Payé\\\"},\\\"overdue\\\":\\\"En retard\\\"},\\\"clients\\\":{\\\"title\\\":\\\"Clients\\\",\\\"add\\\":\\\"Nouveau client\\\",\\\"name\\\":\\\"Nom\\\",\\\"phone\\\":\\\"Téléphone\\\",\\\"country\\\":\\\"Pays\\\",\\\"city\\\":\\\"Ville\\\",\\\"trust_level\\\":\\\"Niveau de confiance\\\",\\\"note\\\":\\\"Note\\\",\\\"trust_levels\\\":{\\\"standard\\\":\\\"Standard\\\",\\\"vip\\\":\\\"VIP\\\",\\\"risky\\\":\\\"Risqué\\\"},\\\"orders_count\\\":\\\"commandes\\\"},\\\"orders\\\":{\\\"title\\\":\\\"Commandes\\\",\\\"add\\\":\\\"Nouvelle commande\\\",\\\"product\\\":\\\"Produit\\\",\\\"client\\\":\\\"Client\\\",\\\"tracking\\\":\\\"Code suivi\\\",\\\"client_price\\\":\\\"Prix client\\\",\\\"supplier_price\\\":\\\"Prix fournisseur\\\",\\\"margin\\\":\\\"Marge\\\",\\\"advance\\\":\\\"Avance reçue\\\",\\\"status\\\":\\\"Statut\\\",\\\"last_update\\\":\\\"Dernière MAJ\\\",\\\"next_action\\\":\\\"Prochaine action\\\",\\\"note\\\":\\\"Note\\\",\\\"statuses\\\":{\\\"new\\\":\\\"Nouveau\\\",\\\"sourcing\\\":\\\"En recherche\\\",\\\"ordered\\\":\\\"Commandé\\\",\\\"shipped\\\":\\\"Expédié\\\",\\\"delivered\\\":\\\"Livré\\\",\\\"paid\\\":\\\"Payé\\\",\\\"cancelled\\\":\\\"Annulé\\\"}},\\\"alerts\\\":{\\\"title\\\":\\\"Alertes\\\",\\\"mark_read\\\":\\\"Marquer comme lu\\\",\\\"mark_all_read\\\":\\\"Tout marquer comme lu\\\",\\\"types\\\":{\\\"budget\\\":\\\"Budget\\\",\\\"debt_due\\\":\\\"Dette échue\\\",\\\"negative_balance\\\":\\\"Solde négatif\\\",\\\"custom\\\":\\\"Personnalisé\\\"},\\\"empty\\\":\\\"Aucune alerte\\\"},\\\"export\\\":{\\\"title\\\":\\\"Export\\\",\\\"type_label\\\":\\\"Type d'export\\\",\\\"type_all\\\":\\\"Toutes les transactions\\\",\\\"type_real_income\\\":\\\"Revenus réels uniquement\\\",\\\"type_real_expense\\\":\\\"Dépenses réelles uniquement\\\",\\\"type_client_money\\\":\\\"Argent client uniquement\\\",\\\"type_per_client\\\":\\\"Par client\\\",\\\"type_per_order\\\":\\\"Par commande\\\",\\\"type_debts\\\":\\\"Dettes\\\",\\\"type_receivables\\\":\\\"Créances\\\",\\\"type_legacy\\\":\\\"Legacy (non classées)\\\",\\\"type_json_backup\\\":\\\"Backup JSON complet\\\",\\\"filters_label\\\":\\\"Filtres\\\",\\\"period_label\\\":\\\"Période\\\",\\\"period_month\\\":\\\"Ce mois\\\",\\\"period_last_month\\\":\\\"Mois dernier\\\",\\\"period_year\\\":\\\"Cette année\\\",\\\"period_all\\\":\\\"Tout\\\",\\\"period_custom\\\":\\\"Personnalisé\\\",\\\"from_date\\\":\\\"Du\\\",\\\"to_date\\\":\\\"Au\\\",\\\"client_label\\\":\\\"Client\\\",\\\"order_label\\\":\\\"Commande\\\",\\\"account_label\\\":\\\"Compte\\\",\\\"all_clients\\\":\\\"Tous les clients\\\",\\\"all_orders\\\":\\\"Toutes les commandes\\\",\\\"all_accounts\\\":\\\"Tous les comptes\\\",\\\"include_legacy\\\":\\\"Inclure les transactions legacy\\\",\\\"btn_csv\\\":\\\"Télécharger CSV\\\",\\\"btn_json\\\":\\\"Backup JSON complet\\\",\\\"generating\\\":\\\"Génération.
   - Capture d'écran : tests/reports/screenshots/zones-dashboard-Dashboard--c6a78--des-zeros-propres-sans-NaN-chromium/test-failed-1.png
2. Dettes - double clic paiement cree un seul paiement — intermittent
   - Zone : debts
   - Action faite : Le test a exécuté le scénario "Dettes - double clic paiement cree un seul paiement".
   - Résultat attendu : attendu 1 paiement, actuel 2.
   - Résultat obtenu : actuel 2.
   - Capture d'écran : tests/reports/screenshots/zones-debts-Dettes---doubl-ba55a-ement-cree-un-seul-paiement-chromium/test-failed-1.png
3. Coherence - Divine affiche le meme 118 USD partout — observé une fois
   - Zone : cross-consistency
   - Action faite : Le test a exécuté le scénario "Coherence - Divine affiche le meme 118 USD partout".
   - Résultat attendu : Le scénario devait réussir avec les mêmes montants sur toutes les pages concernées.
   - Résultat obtenu : received).
   - Capture d'écran : tests/reports/screenshots/zones-cross-consistency-Co-bc592-che-le-meme-118-USD-partout-chromium/test-failed-1.png

## 3. Bugs moyens
1. Comptes - creer Test Account en CNY avec solde 0 — intermittent
   - Zone : accounts
   - Action faite : Le test a exécuté le scénario "Comptes - creer Test Account en CNY avec solde 0".
   - Résultat attendu : Expected: visible Error: strict mode violation: locator('main') resolved to 2 elements: 1) <main class="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">…</main> aka getByRole('main') 2) <main class="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">…</main> aka locator('main').
   - Résultat obtenu : Error: expect(locator).toBeVisible() failed Locator: locator('main') Expected: visible Error: strict mode violation: locator('main') resolved to 2 elements: 1) <main class="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">…</main> aka getByRole('main') 2) <main class="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">…</main> aka locator('main').nth(1) Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for locator('main')
   - Capture d'écran : tests/reports/screenshots/zones-accounts-Comptes---c-9406d-Account-en-CNY-avec-solde-0-chromium/test-failed-1.png
2. Clients - creer Joseph Test dans la liste — observé une fois
   - Zone : clients
   - Action faite : Le test a exécuté le scénario "Clients - creer Joseph Test dans la liste".
   - Résultat attendu : Expected: visible Error: strict mode violation: locator('main') resolved to 2 elements: 1) <main class="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">…</main> aka getByRole('main') 2) <main class="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">…</main> aka locator('main').
   - Résultat obtenu : Error: expect(locator).toBeVisible() failed Locator: locator('main') Expected: visible Error: strict mode violation: locator('main') resolved to 2 elements: 1) <main class="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">…</main> aka getByRole('main') 2) <main class="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">…</main> aka locator('main').nth(1) Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for locator('main')
   - Capture d'écran : tests/reports/screenshots/zones-clients-Clients---creer-Joseph-Test-dans-la-liste-chromium/test-failed-1.png
3. DEBUG balance correction logic (no networkidle) — confirmé
   - Zone : debug-tx
   - Action faite : Le test a exécuté le scénario "DEBUG balance correction logic (no networkidle)".
   - Résultat attendu : Le scénario devait réussir avec les mêmes montants sur toutes les pages concernées.
   - Résultat obtenu : Test timeout of 30000ms exceeded.
   - Capture d'écran : tests/reports/screenshots/zones-debug-tx-DEBUG-balan-0dcea-ction-logic-no-networkidle--chromium/test-failed-1.png
4. Commandes - solde commande et solde client suivent recu moins achat — confirmé
   - Zone : orders
   - Action faite : Le test a exécuté le scénario "Commandes - solde commande et solde client suivent recu moins achat".
   - Résultat attendu : Le scénario devait réussir avec les mêmes montants sur toutes les pages concernées.
   - Résultat obtenu : received).
   - Capture d'écran : tests/reports/screenshots/zones-orders-Commandes---s-6f8ff-nt-suivent-recu-moins-achat-chromium/test-failed-1.png
5. Transactions - edition: modifier 100 USD en 50 USD met a jour Comptes et Tableau de bord — confirmé
   - Zone : transactions
   - Action faite : Le test a exécuté le scénario "Transactions - edition: modifier 100 USD en 50 USD met a jour Comptes et Tableau de bord".
   - Résultat attendu : Expected: visible Timeout: 5000ms Error: element(s) not found Call log: - Le scenario d'edition ne peut pas continuer: l'UI Transactions actuelle n'expose aucun bouton Modifier/Editer pour une transaction.
   - Résultat obtenu : actuelle n'expose aucun bouton Modifier/Editer pour une transaction.
   - Capture d'écran : tests/reports/screenshots/zones-transactions-Transac-d17dc--Comptes-et-Tableau-de-bord-chromium/test-failed-1.png
6. Transferts - conversion 500 CNY Alipay vers Mercury applique le taux — confirmé
   - Zone : transfers
   - Action faite : Le test a exécuté le scénario "Transferts - conversion 500 CNY Alipay vers Mercury applique le taux".
   - Résultat attendu : Expected: visible Timeout: 5000ms Error: element(s) not found Call log: - Champ introuvable: /^Taux de change$/ with timeout 5000ms - waiting for locator('label').
   - Résultat obtenu : Error: Champ introuvable: /^Taux de change$/ expect(locator).toBeVisible() failed Locator: locator('label').filter({ hasText: /^Taux de change$/ }).first().locator('..').locator('input[type="number"]').first() Expected: visible Timeout: 5000ms Error: element(s) not found Call log: - Champ introuvable: /^Taux de change$/ with timeout 5000ms - waiting for locator('label').filter({ hasText: /^Taux de change$/ }).first().locator('..').locator('input[type="number"]').first()
   - Capture d'écran : tests/reports/screenshots/zones-transfers-Transferts-a082d-rs-Mercury-applique-le-taux-chromium/test-failed-1.png
7. UI globale - bascule sombre clair change la classe html et reste lisible — confirmé
   - Zone : ui-global
   - Action faite : Le test a exécuté le scénario "UI globale - bascule sombre clair change la classe html et reste lisible".
   - Résultat attendu : Le scénario devait réussir avec les mêmes montants sur toutes les pages concernées.
   - Résultat obtenu : Test timeout of 30000ms exceeded.
   - Capture d'écran : tests/reports/screenshots/zones-ui-global-UI-globale-ecbc4-lasse-html-et-reste-lisible-chromium/test-failed-1.png
8. Comptes - disponibilite immediate vers bloquee met a jour le split dashboard — intermittent
   - Zone : accounts
   - Action faite : Le test a exécuté le scénario "Comptes - disponibilite immediate vers bloquee met a jour le split dashboard".
   - Résultat attendu : Le scénario devait réussir avec les mêmes montants sur toutes les pages concernées.
   - Résultat obtenu : Test timeout of 90000ms exceeded.
   - Capture d'écran : tests/reports/screenshots/zones-accounts-Comptes---d-b31ad-t-a-jour-le-split-dashboard-chromium/test-failed-1.png
9. Dashboard - Argent client detenu egale recu moins couts moins remboursements moins benefice — intermittent
   - Zone : dashboard
   - Action faite : Le test a exécuté le scénario "Dashboard - Argent client detenu egale recu moins couts moins remboursements moins benefice".
   - Résultat attendu : Le scénario devait réussir avec les mêmes montants sur toutes les pages concernées.
   - Résultat obtenu : received).
   - Capture d'écran : tests/reports/screenshots/zones-dashboard-Dashboard--c76a6-mboursements-moins-benefice-chromium/test-failed-1.png
10. Dettes - creer une creance 150 USD apparait dans Creances a recevoir — observé une fois
   - Zone : debts
   - Action faite : Le test a exécuté le scénario "Dettes - creer une creance 150 USD apparait dans Creances a recevoir".
   - Résultat attendu : Expected: visible Error: strict mode violation: locator('main') resolved to 2 elements: 1) <main class="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">…</main> aka getByRole('main') 2) <main class="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">…</main> aka locator('main').
   - Résultat obtenu : Error: expect(locator).toBeVisible() failed Locator: locator('main') Expected: visible Error: strict mode violation: locator('main') resolved to 2 elements: 1) <main class="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">…</main> aka getByRole('main') 2) <main class="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">…</main> aka locator('main').nth(1) Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for locator('main')
   - Capture d'écran : tests/reports/screenshots/zones-debts-Dettes---creer-83506-it-dans-Creances-a-recevoir-chromium/test-failed-1.png
11. Dashboard - alertes visibles pour dette en retard et deficit client — observé une fois
   - Zone : dashboard
   - Action faite : Le test a exécuté le scénario "Dashboard - alertes visibles pour dette en retard et deficit client".
   - Résultat attendu : Le scénario devait réussir avec les mêmes montants sur toutes les pages concernées.
   - Résultat obtenu : received).
   - Capture d'écran : tests/reports/screenshots/zones-dashboard-Dashboard--1ede2-en-retard-et-deficit-client-chromium/test-failed-1.png
12. Clients - solde client = recu moins couts moins remboursements — observé une fois
   - Zone : clients
   - Action faite : Le test a exécuté le scénario "Clients - solde client = recu moins couts moins remboursements".
   - Résultat attendu : Le scénario devait réussir avec les mêmes montants sur toutes les pages concernées.
   - Résultat obtenu : received).
   - Capture d'écran : tests/reports/screenshots/zones-clients-Clients---so-3575b--couts-moins-remboursements-chromium/test-failed-1.png
13. Comptes - correction de solde cree balance_correction et affiche 500 CNY — observé une fois
   - Zone : accounts
   - Action faite : Le test a exécuté le scénario "Comptes - correction de solde cree balance_correction et affiche 500 CNY".
   - Résultat attendu : Le scénario devait réussir avec les mêmes montants sur toutes les pages concernées.
   - Résultat obtenu : received).
   - Capture d'écran : tests/reports/screenshots/zones-accounts-Comptes---c-8f9fa-rrection-et-affiche-500-CNY-chromium/test-failed-1.png

## 4. Bugs mineurs
Aucun bug dans cette catégorie.

## 5. Captures d'écran
| Bug | Capture |
| --- | --- |
| Dashboard - transactions vides affichent des zeros propres sans NaN | tests/reports/screenshots/zones-dashboard-Dashboard--c6a78--des-zeros-propres-sans-NaN-chromium/test-failed-1.png |
| Dashboard - transactions vides affichent des zeros propres sans NaN | tests/reports/screenshots/zones-transactions-Transac-d17dc--Comptes-et-Tableau-de-bord-chromium/test-failed-1.png |
| Dashboard - transactions vides affichent des zeros propres sans NaN | tests/reports/screenshots/zones-accounts-Comptes---d-b31ad-t-a-jour-le-split-dashboard-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-debts-Dettes---doubl-ba55a-ement-cree-un-seul-paiement-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/ui-global/8-theme-dark-initial.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-accounts-Comptes---c-9406d-Account-en-CNY-avec-solde-0-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-clients-Clients---creer-Joseph-Test-dans-la-liste-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-dashboard-Dashboard--c6a78--des-zeros-propres-sans-NaN-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-debug-tx-DEBUG-balan-0dcea-ction-logic-no-networkidle--chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-orders-Commandes---s-6f8ff-nt-suivent-recu-moins-achat-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-transactions-Transac-d17dc--Comptes-et-Tableau-de-bord-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-transfers-Transferts-a082d-rs-Mercury-applique-le-taux-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-ui-global-UI-globale-ecbc4-lasse-html-et-reste-lisible-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-dashboard-Dashboard--1ede2-en-retard-et-deficit-client-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/ui-global/9-theme-dark-initial.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-accounts-Comptes---d-b31ad-t-a-jour-le-split-dashboard-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-clients-Clients---so-3575b--couts-moins-remboursements-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-cross-consistency-Co-bc592-che-le-meme-118-USD-partout-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-accounts-Comptes---c-8f9fa-rrection-et-affiche-500-CNY-chromium/test-failed-1.png |
| Dettes - double clic paiement cree un seul paiement | tests/reports/screenshots/zones-dashboard-Dashboard--c76a6-mboursements-moins-benefice-chromium/test-failed-1.png |
| Coherence - Divine affiche le meme 118 USD partout | tests/reports/screenshots/zones-cross-consistency-Co-bc592-che-le-meme-118-USD-partout-chromium/test-failed-1.png |
| Comptes - creer Test Account en CNY avec solde 0 | tests/reports/screenshots/zones-accounts-Comptes---c-9406d-Account-en-CNY-avec-solde-0-chromium/test-failed-1.png |
| Comptes - creer Test Account en CNY avec solde 0 | tests/reports/screenshots/ui-global/8-theme-dark-initial.png |
| Comptes - creer Test Account en CNY avec solde 0 | tests/reports/screenshots/zones-clients-Clients---creer-Joseph-Test-dans-la-liste-chromium/test-failed-1.png |
| Comptes - creer Test Account en CNY avec solde 0 | tests/reports/screenshots/zones-dashboard-Dashboard--c6a78--des-zeros-propres-sans-NaN-chromium/test-failed-1.png |
| Comptes - creer Test Account en CNY avec solde 0 | tests/reports/screenshots/zones-debts-Dettes---doubl-ba55a-ement-cree-un-seul-paiement-chromium/test-failed-1.png |
| Comptes - creer Test Account en CNY avec solde 0 | tests/reports/screenshots/zones-debug-tx-DEBUG-balan-0dcea-ction-logic-no-networkidle--chromium/test-failed-1.png |
| Comptes - creer Test Account en CNY avec solde 0 | tests/reports/screenshots/zones-orders-Commandes---s-6f8ff-nt-suivent-recu-moins-achat-chromium/test-failed-1.png |
| Comptes - creer Test Account en CNY avec solde 0 | tests/reports/screenshots/zones-transactions-Transac-d17dc--Comptes-et-Tableau-de-bord-chromium/test-failed-1.png |
| Comptes - creer Test Account en CNY avec solde 0 | tests/reports/screenshots/zones-transfers-Transferts-a082d-rs-Mercury-applique-le-taux-chromium/test-failed-1.png |
| Comptes - creer Test Account en CNY avec solde 0 | tests/reports/screenshots/zones-ui-global-UI-globale-ecbc4-lasse-html-et-reste-lisible-chromium/test-failed-1.png |
| Comptes - creer Test Account en CNY avec solde 0 | tests/reports/screenshots/zones-dashboard-Dashboard--1ede2-en-retard-et-deficit-client-chromium/test-failed-1.png |
| Clients - creer Joseph Test dans la liste | tests/reports/screenshots/zones-clients-Clients---creer-Joseph-Test-dans-la-liste-chromium/test-failed-1.png |
| Clients - creer Joseph Test dans la liste | tests/reports/screenshots/ui-global/8-theme-dark-initial.png |
| Clients - creer Joseph Test dans la liste | tests/reports/screenshots/zones-accounts-Comptes---c-9406d-Account-en-CNY-avec-solde-0-chromium/test-failed-1.png |
| Clients - creer Joseph Test dans la liste | tests/reports/screenshots/zones-dashboard-Dashboard--c6a78--des-zeros-propres-sans-NaN-chromium/test-failed-1.png |
| Clients - creer Joseph Test dans la liste | tests/reports/screenshots/zones-debts-Dettes---doubl-ba55a-ement-cree-un-seul-paiement-chromium/test-failed-1.png |
| Clients - creer Joseph Test dans la liste | tests/reports/screenshots/zones-debug-tx-DEBUG-balan-0dcea-ction-logic-no-networkidle--chromium/test-failed-1.png |
| Clients - creer Joseph Test dans la liste | tests/reports/screenshots/zones-orders-Commandes---s-6f8ff-nt-suivent-recu-moins-achat-chromium/test-failed-1.png |
| Clients - creer Joseph Test dans la liste | tests/reports/screenshots/zones-transactions-Transac-d17dc--Comptes-et-Tableau-de-bord-chromium/test-failed-1.png |
| Clients - creer Joseph Test dans la liste | tests/reports/screenshots/zones-transfers-Transferts-a082d-rs-Mercury-applique-le-taux-chromium/test-failed-1.png |
| Clients - creer Joseph Test dans la liste | tests/reports/screenshots/zones-ui-global-UI-globale-ecbc4-lasse-html-et-reste-lisible-chromium/test-failed-1.png |
| DEBUG balance correction logic (no networkidle) | tests/reports/screenshots/zones-debug-tx-DEBUG-balan-0dcea-ction-logic-no-networkidle--chromium/test-failed-1.png |
| Commandes - solde commande et solde client suivent recu moins achat | tests/reports/screenshots/zones-orders-Commandes---s-6f8ff-nt-suivent-recu-moins-achat-chromium/test-failed-1.png |
| Commandes - solde commande et solde client suivent recu moins achat | tests/reports/screenshots/zones-accounts-Comptes---c-9406d-Account-en-CNY-avec-solde-0-chromium/test-failed-1.png |
| Commandes - solde commande et solde client suivent recu moins achat | tests/reports/screenshots/zones-clients-Clients---creer-Joseph-Test-dans-la-liste-chromium/test-failed-1.png |
| Commandes - solde commande et solde client suivent recu moins achat | tests/reports/screenshots/zones-dashboard-Dashboard--c76a6-mboursements-moins-benefice-chromium/test-failed-1.png |
| Commandes - solde commande et solde client suivent recu moins achat | tests/reports/screenshots/zones-dashboard-Dashboard--1ede2-en-retard-et-deficit-client-chromium/test-failed-1.png |
| Commandes - solde commande et solde client suivent recu moins achat | tests/reports/screenshots/zones-clients-Clients---so-3575b--couts-moins-remboursements-chromium/test-failed-1.png |
| Transactions - edition: modifier 100 USD en 50 USD met a jour Comptes et Tableau de bord | tests/reports/screenshots/zones-transactions-Transac-d17dc--Comptes-et-Tableau-de-bord-chromium/test-failed-1.png |
| Transactions - edition: modifier 100 USD en 50 USD met a jour Comptes et Tableau de bord | tests/reports/screenshots/zones-accounts-Comptes---c-9406d-Account-en-CNY-avec-solde-0-chromium/test-failed-1.png |
| Transactions - edition: modifier 100 USD en 50 USD met a jour Comptes et Tableau de bord | tests/reports/screenshots/zones-accounts-Comptes---d-b31ad-t-a-jour-le-split-dashboard-chromium/test-failed-1.png |
| Transactions - edition: modifier 100 USD en 50 USD met a jour Comptes et Tableau de bord | tests/reports/screenshots/zones-accounts-Comptes---c-8f9fa-rrection-et-affiche-500-CNY-chromium/test-failed-1.png |
| Transferts - conversion 500 CNY Alipay vers Mercury applique le taux | tests/reports/screenshots/zones-transfers-Transferts-a082d-rs-Mercury-applique-le-taux-chromium/test-failed-1.png |
| UI globale - bascule sombre clair change la classe html et reste lisible | tests/reports/screenshots/zones-ui-global-UI-globale-ecbc4-lasse-html-et-reste-lisible-chromium/test-failed-1.png |
| Comptes - disponibilite immediate vers bloquee met a jour le split dashboard | tests/reports/screenshots/zones-accounts-Comptes---d-b31ad-t-a-jour-le-split-dashboard-chromium/test-failed-1.png |
| Comptes - disponibilite immediate vers bloquee met a jour le split dashboard | tests/reports/screenshots/zones-dashboard-Dashboard--c76a6-mboursements-moins-benefice-chromium/test-failed-1.png |
| Comptes - disponibilite immediate vers bloquee met a jour le split dashboard | tests/reports/screenshots/zones-transactions-Transac-d17dc--Comptes-et-Tableau-de-bord-chromium/test-failed-1.png |
| Comptes - disponibilite immediate vers bloquee met a jour le split dashboard | tests/reports/screenshots/zones-dashboard-Dashboard--c6a78--des-zeros-propres-sans-NaN-chromium/test-failed-1.png |
| Dashboard - Argent client detenu egale recu moins couts moins remboursements moins benefice | tests/reports/screenshots/zones-dashboard-Dashboard--c76a6-mboursements-moins-benefice-chromium/test-failed-1.png |
| Dashboard - Argent client detenu egale recu moins couts moins remboursements moins benefice | tests/reports/screenshots/zones-accounts-Comptes---d-b31ad-t-a-jour-le-split-dashboard-chromium/test-failed-1.png |
| Dashboard - Argent client detenu egale recu moins couts moins remboursements moins benefice | tests/reports/screenshots/zones-orders-Commandes---s-6f8ff-nt-suivent-recu-moins-achat-chromium/test-failed-1.png |
| Dettes - creer une creance 150 USD apparait dans Creances a recevoir | tests/reports/screenshots/zones-debts-Dettes---creer-83506-it-dans-Creances-a-recevoir-chromium/test-failed-1.png |
| Dashboard - alertes visibles pour dette en retard et deficit client | tests/reports/screenshots/zones-dashboard-Dashboard--1ede2-en-retard-et-deficit-client-chromium/test-failed-1.png |
| Dashboard - alertes visibles pour dette en retard et deficit client | tests/reports/screenshots/zones-debts-Dettes---doubl-ba55a-ement-cree-un-seul-paiement-chromium/test-failed-1.png |
| Clients - solde client = recu moins couts moins remboursements | tests/reports/screenshots/zones-clients-Clients---so-3575b--couts-moins-remboursements-chromium/test-failed-1.png |
| Clients - solde client = recu moins couts moins remboursements | tests/reports/screenshots/zones-orders-Commandes---s-6f8ff-nt-suivent-recu-moins-achat-chromium/test-failed-1.png |
| Comptes - correction de solde cree balance_correction et affiche 500 CNY | tests/reports/screenshots/zones-accounts-Comptes---c-8f9fa-rrection-et-affiche-500-CNY-chromium/test-failed-1.png |
| Comptes - correction de solde cree balance_correction et affiche 500 CNY | tests/reports/screenshots/zones-dashboard-Dashboard--c76a6-mboursements-moins-benefice-chromium/test-failed-1.png |
| Comptes - correction de solde cree balance_correction et affiche 500 CNY | tests/reports/screenshots/zones-debts-Dettes---doubl-ba55a-ement-cree-un-seul-paiement-chromium/test-failed-1.png |
| Comptes - correction de solde cree balance_correction et affiche 500 CNY | tests/reports/screenshots/zones-debug-tx-DEBUG-balan-0dcea-ction-logic-no-networkidle--chromium/test-failed-1.png |
| Comptes - correction de solde cree balance_correction et affiche 500 CNY | tests/reports/screenshots/zones-orders-Commandes---s-6f8ff-nt-suivent-recu-moins-achat-chromium/test-failed-1.png |
| Comptes - correction de solde cree balance_correction et affiche 500 CNY | tests/reports/screenshots/zones-transactions-Transac-d17dc--Comptes-et-Tableau-de-bord-chromium/test-failed-1.png |
| Comptes - correction de solde cree balance_correction et affiche 500 CNY | tests/reports/screenshots/zones-transfers-Transferts-a082d-rs-Mercury-applique-le-taux-chromium/test-failed-1.png |
| Comptes - correction de solde cree balance_correction et affiche 500 CNY | tests/reports/screenshots/zones-ui-global-UI-globale-ecbc4-lasse-html-et-reste-lisible-chromium/test-failed-1.png |

## 6. Recommandation pour demain
1. Corriger d'abord les bugs critiques confirmés.
2. Corriger ensuite les bugs moyens qui reviennent plusieurs fois.
3. Finir par les bugs mineurs d'affichage et de confort.
4. Relancer une nuit complète pour vérifier que les corrections tiennent dans le temps.
