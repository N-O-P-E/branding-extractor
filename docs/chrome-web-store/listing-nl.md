# Chrome Web Store Listing — Visual Issue Reporter

## Naam
Visual Issue Reporter by Studio N.O.P.E.

## Korte omschrijving (132 tekens max)
Meld visuele bugs op elke website rechtstreeks in GitHub met screenshots, annotaties en schermopnames.

## Gedetailleerde omschrijving

Visual Issue Reporter maakt het makkelijk om visuele problemen op elke website te melden, rechtstreeks in GitHub.

**Wat kun je ermee?**
- Maak screenshots en teken erop met annotaties om precies aan te geven wat er mis is
- Neem je scherm op, optioneel met microfoon, om bugs in actie te laten zien
- Issues worden automatisch aangemaakt in je GitHub repository, inclusief alle context

**Voor wie?**
Ontwikkelaars, QA teams en projectmanagers die visuele feedback willen stroomlijnen. Geen aparte bugtracker nodig: alles komt direct in GitHub terecht.

**Hoe werkt het?**
1. Open het zijpaneel via de extensie
2. Kies je GitHub repository en branch
3. Gebruik de screenshot of opnametool
4. Voeg een beschrijving toe en dien het issue in

**Privacy en veiligheid**
- Je GitHub token wordt alleen lokaal opgeslagen
- Screenshots en opnames worden uitsluitend naar jouw eigen GitHub repository gestuurd
- Er worden geen gegevens naar derden verzonden
- De extensie bevat geen analytics of tracking

**Optionele functies**
- Schermopnames met inline videoweergave in GitHub (vereist aanvullende toestemming voor cookies)
- Automatische bugfixes via Claude AI (vereist aparte configuratie)

## Eenduidige functie (Single Purpose)
Visuele problemen op elke webpagina melden in GitHub met screenshots, annotaties en schermopnames.

## Toestemmingen (Permission Justifications)

### activeTab
Nodig om screenshots te maken van de huidige pagina en te communiceren met het contentscript dat de tekenoverlay toont.

### storage
Slaat je GitHub token, geselecteerde repository, branch en themavoorkeur lokaal op zodat je niet elke keer opnieuw hoeft in te stellen.

### sidePanel
De hele gebruikersinterface van de extensie draait in het Chrome zijpaneel. Zonder deze toestemming kan de extensie niet functioneren.

### host_permissions: alle websites
De extensie moet werken op elke website die je bezoekt, omdat je visuele bugs kunt melden op elke pagina. Contentscripts moeten op elke pagina worden geladen om de screenshot overlay en tekenfunctionaliteit te bieden.

### cookies (optioneel)
Alleen gebruikt om je GitHub sessiecookies te lezen wanneer je een schermopname uploadt. Dit maakt het mogelijk om video's direct in GitHub issues weer te geven in plaats van als downloadlink. Je kunt deze toestemming weigeren; de extensie valt dan terug op een downloadlink.

### declarativeNetRequest (optioneel)
Werkt samen met de cookies toestemming om authenticatieheaders in te stellen bij het uploaden van schermopnames naar GitHub. Fetch verwijdert bepaalde headers zoals Cookie en Origin; deze toestemming omzeilt dat op netwerkniveau. Wordt alleen gebruikt voor uploads naar github.com.

## Categorie
Developer Tools

## Taal
Nederlands
