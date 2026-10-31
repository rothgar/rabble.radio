package radio.rabble.android

/**
 * Mirror of src/lib/tags.ts on the server: the canonical category list and
 * the "primary tag" rule (earliest category in this list wins) that groups
 * shows into stations.
 */
object Tags {
    val CATEGORIES: List<String> = listOf(
        "Autos & Vehicles",
        "Comedy",
        "Education",
        "Entertainment",
        "Film & Animation",
        "Gaming",
        "Howto & Style",
        "Music",
        "News & Politics",
        "Nonprofits & Activism",
        "People & Blogs",
        "Pets & Animals",
        "Science & Technology",
        "Sports",
        "Travel & Events",
    )

    fun primaryTagOf(tags: List<String>): String? =
        tags.filter { it in CATEGORIES }.minByOrNull { CATEGORIES.indexOf(it) }
}
