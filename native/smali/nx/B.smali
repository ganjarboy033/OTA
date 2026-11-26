.class public Lnx/B;
.super Ljava/lang/Object;

.field a:Landroid/app/Activity;
.field m:Ljava/util/Hashtable;

.method public constructor <init>(Landroid/app/Activity;)V
    .registers 4
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    iput-object p1, p0, Lnx/B;->a:Landroid/app/Activity;
    new-instance v0, Ljava/util/Hashtable;
    invoke-direct {v0}, Ljava/util/Hashtable;-><init>()V
    iput-object v0, p0, Lnx/B;->m:Ljava/util/Hashtable;
    return-void
.end method

.method public req(Ljava/lang/String;Ljava/lang/String;)V
    .js
    .registers 6
    new-instance v0, Lnx/H;
    iget-object v1, p0, Lnx/B;->m:Ljava/util/Hashtable;
    invoke-direct {v0, v1, p1, p2}, Lnx/H;-><init>(Ljava/util/Hashtable;Ljava/lang/String;Ljava/lang/String;)V
    new-instance v1, Ljava/lang/Thread;
    invoke-direct {v1, v0}, Ljava/lang/Thread;-><init>(Ljava/lang/Runnable;)V
    invoke-virtual {v1}, Ljava/lang/Thread;->start()V
    return-void
.end method

.method public poll(Ljava/lang/String;)Ljava/lang/String;
    .js
    .registers 3
    iget-object v0, p0, Lnx/B;->m:Ljava/util/Hashtable;
    invoke-virtual {v0, p1}, Ljava/util/Hashtable;->remove(Ljava/lang/Object;)Ljava/lang/Object;
    move-result-object v0
    check-cast v0, Ljava/lang/String;
    return-object v0
.end method

.method public dl(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    .js
    .registers 13
    :ts
    invoke-static {p1}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v0
    new-instance v1, Landroid/app/DownloadManager$Request;
    invoke-direct {v1, v0}, Landroid/app/DownloadManager$Request;-><init>(Landroid/net/Uri;)V
    invoke-virtual {v1, p2}, Landroid/app/DownloadManager$Request;->setTitle(Ljava/lang/CharSequence;)Landroid/app/DownloadManager$Request;
    invoke-virtual {v1, p3}, Landroid/app/DownloadManager$Request;->setMimeType(Ljava/lang/String;)Landroid/app/DownloadManager$Request;
    const/4 v0, 1
    invoke-virtual {v1, v0}, Landroid/app/DownloadManager$Request;->setNotificationVisibility(I)Landroid/app/DownloadManager$Request;
    const-string v0, "Download"
    invoke-virtual {v1, v0, p2}, Landroid/app/DownloadManager$Request;->setDestinationInExternalPublicDir(Ljava/lang/String;Ljava/lang/String;)Landroid/app/DownloadManager$Request;
    const-string v0, "\n"
    invoke-virtual {p4, v0}, Ljava/lang/String;->split(Ljava/lang/String;)[Ljava/lang/String;
    move-result-object v2
    const/4 v3, 0
    array-length v4, v2
    :loop
    if-ge v3, v4, :done
    aget-object v5, v2, v3
    const/16 v6, 0x3a
    invoke-virtual {v5, v6}, Ljava/lang/String;->indexOf(I)I
    move-result v6
    if-lez v6, :next
    const/4 v7, 0
    invoke-virtual {v5, v7, v6}, Ljava/lang/String;->substring(II)Ljava/lang/String;
    move-result-object v7
    invoke-virtual {v7}, Ljava/lang/String;->trim()Ljava/lang/String;
    move-result-object v7
    add-int/lit8 v6, v6, 1
    invoke-virtual {v5, v6}, Ljava/lang/String;->substring(I)Ljava/lang/String;
    move-result-object v5
    invoke-virtual {v5}, Ljava/lang/String;->trim()Ljava/lang/String;
    move-result-object v5
    invoke-virtual {v1, v7, v5}, Landroid/app/DownloadManager$Request;->addRequestHeader(Ljava/lang/String;Ljava/lang/String;)Landroid/app/DownloadManager$Request;
    :next
    add-int/lit8 v3, v3, 1
    goto/16 :loop
    :done
    iget-object v0, p0, Lnx/B;->a:Landroid/app/Activity;
    const-string v2, "download"
    invoke-virtual {v0, v2}, Landroid/app/Activity;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;
    move-result-object v0
    check-cast v0, Landroid/app/DownloadManager;
    invoke-virtual {v0, v1}, Landroid/app/DownloadManager;->enqueue(Landroid/app/DownloadManager$Request;)J
    move-result-wide v2
    invoke-static {v2, v3}, Ljava/lang/String;->valueOf(J)Ljava/lang/String;
    move-result-object v0
    return-object v0
    :te
    :handler
    move-exception v0
    const-string v0, ""
    return-object v0
    .catch Ljava/lang/Throwable; {:ts .. :te} :handler
.end method

.method public dlState(Ljava/lang/String;)Ljava/lang/String;
    .js
    .registers 10
    :ts
    iget-object v0, p0, Lnx/B;->a:Landroid/app/Activity;
    const-string v1, "download"
    invoke-virtual {v0, v1}, Landroid/app/Activity;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;
    move-result-object v0
    check-cast v0, Landroid/app/DownloadManager;
    new-instance v1, Landroid/app/DownloadManager$Query;
    invoke-direct {v1}, Landroid/app/DownloadManager$Query;-><init>()V
    invoke-static {p1}, Ljava/lang/Long;->parseLong(Ljava/lang/String;)J
    move-result-wide v2
    const/4 v4, 1
    new-array v4, v4, [J
    const/4 v5, 0
    aput-wide v2, v4, v5
    invoke-virtual {v1, v4}, Landroid/app/DownloadManager$Query;->setFilterById([J)Landroid/app/DownloadManager$Query;
    invoke-virtual {v0, v1}, Landroid/app/DownloadManager;->query(Landroid/app/DownloadManager$Query;)Landroid/database/Cursor;
    move-result-object v0
    invoke-interface {v0}, Landroid/database/Cursor;->moveToFirst()Z
    move-result v1
    const-string v2, ""
    if-eqz v1, :close
    new-instance v1, Ljava/lang/StringBuilder;
    invoke-direct {v1}, Ljava/lang/StringBuilder;-><init>()V
    const-string v2, "status"
    invoke-interface {v0, v2}, Landroid/database/Cursor;->getColumnIndex(Ljava/lang/String;)I
    move-result v3
    invoke-interface {v0, v3}, Landroid/database/Cursor;->getInt(I)I
    move-result v3
    invoke-virtual {v1, v3}, Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;
    const-string v2, "|"
    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v2, "bytes_so_far"
    invoke-interface {v0, v2}, Landroid/database/Cursor;->getColumnIndex(Ljava/lang/String;)I
    move-result v3
    invoke-interface {v0, v3}, Landroid/database/Cursor;->getLong(I)J
    move-result-wide v4
    invoke-virtual {v1, v4, v5}, Ljava/lang/StringBuilder;->append(J)Ljava/lang/StringBuilder;
    const-string v2, "|"
    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v2, "total_size"
    invoke-interface {v0, v2}, Landroid/database/Cursor;->getColumnIndex(Ljava/lang/String;)I
    move-result v3
    invoke-interface {v0, v3}, Landroid/database/Cursor;->getLong(I)J
    move-result-wide v4
    invoke-virtual {v1, v4, v5}, Ljava/lang/StringBuilder;->append(J)Ljava/lang/StringBuilder;
    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v2
    :close
    invoke-interface {v0}, Landroid/database/Cursor;->close()V
    return-object v2
    :te
    :handler
    move-exception v0
    const-string v0, ""
    return-object v0
    .catch Ljava/lang/Throwable; {:ts .. :te} :handler
.end method

.method public copy(Ljava/lang/String;)V
    .js
    .registers 5
    :ts
    iget-object v0, p0, Lnx/B;->a:Landroid/app/Activity;
    const-string v1, "clipboard"
    invoke-virtual {v0, v1}, Landroid/app/Activity;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;
    move-result-object v0
    check-cast v0, Landroid/content/ClipboardManager;
    const-string v1, "nx"
    invoke-static {v1, p1}, Landroid/content/ClipData;->newPlainText(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Landroid/content/ClipData;
    move-result-object v1
    invoke-virtual {v0, v1}, Landroid/content/ClipboardManager;->setPrimaryClip(Landroid/content/ClipData;)V
    :te
    return-void
    :handler
    move-exception v0
    return-void
    .catch Ljava/lang/Throwable; {:ts .. :te} :handler
.end method

.method public paste()Ljava/lang/String;
    .js
    .registers 4
    :ts
    iget-object v0, p0, Lnx/B;->a:Landroid/app/Activity;
    const-string v1, "clipboard"
    invoke-virtual {v0, v1}, Landroid/app/Activity;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;
    move-result-object v0
    check-cast v0, Landroid/content/ClipboardManager;
    invoke-virtual {v0}, Landroid/content/ClipboardManager;->getPrimaryClip()Landroid/content/ClipData;
    move-result-object v1
    if-eqz v1, :empty
    invoke-virtual {v1}, Landroid/content/ClipData;->getItemCount()I
    move-result v2
    if-eqz v2, :empty
    const/4 v2, 0
    invoke-virtual {v1, v2}, Landroid/content/ClipData;->getItemAt(I)Landroid/content/ClipData$Item;
    move-result-object v1
    iget-object v0, p0, Lnx/B;->a:Landroid/app/Activity;
    invoke-virtual {v1, v0}, Landroid/content/ClipData$Item;->coerceToText(Landroid/content/Context;)Ljava/lang/CharSequence;
    move-result-object v1
    invoke-interface {v1}, Ljava/lang/CharSequence;->toString()Ljava/lang/String;
    move-result-object v0
    return-object v0
    :empty
    const-string v0, ""
    return-object v0
    :te
    :handler
    move-exception v0
    const-string v0, ""
    return-object v0
    .catch Ljava/lang/Throwable; {:ts .. :te} :handler
.end method

.method public open(Ljava/lang/String;)V
    .js
    .registers 5
    :ts
    invoke-static {p1}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v0
    new-instance v1, Landroid/content/Intent;
    const-string v2, "android.intent.action.VIEW"
    invoke-direct {v1, v2, v0}, Landroid/content/Intent;-><init>(Ljava/lang/String;Landroid/net/Uri;)V
    const v0, 0x10000000
    invoke-virtual {v1, v0}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;
    iget-object v0, p0, Lnx/B;->a:Landroid/app/Activity;
    invoke-virtual {v0, v1}, Landroid/app/Activity;->startActivity(Landroid/content/Intent;)V
    :te
    return-void
    :handler
    move-exception v0
    return-void
    .catch Ljava/lang/Throwable; {:ts .. :te} :handler
.end method

.method public downloads()V
    .js
    .registers 4
    :ts
    new-instance v0, Landroid/content/Intent;
    const-string v1, "android.intent.action.VIEW_DOWNLOADS"
    invoke-direct {v0, v1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V
    const v1, 0x10000000
    invoke-virtual {v0, v1}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;
    iget-object v1, p0, Lnx/B;->a:Landroid/app/Activity;
    invoke-virtual {v1, v0}, Landroid/app/Activity;->startActivity(Landroid/content/Intent;)V
    :te
    return-void
    :handler
    move-exception v0
    return-void
    .catch Ljava/lang/Throwable; {:ts .. :te} :handler
.end method

.method public exit()V
    .js
    .registers 3
    iget-object v0, p0, Lnx/B;->a:Landroid/app/Activity;
    invoke-virtual {v0}, Landroid/app/Activity;->finish()V
    return-void
.end method
